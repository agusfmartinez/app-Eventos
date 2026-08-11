"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { Camera, CameraOff, Keyboard, Minus, Plus } from "lucide-react";

import { ResultStamp } from "@/components/scanner/result-stamp";
import {
  confirmCheckInAction,
  resolveShortCodeAction,
  scanLookupAction,
} from "@/lib/actions/checkin";
import type { CheckInResult } from "@/lib/checkin";

/**
 * Scanner de puerta.
 *
 * Prioridades, en orden: que sea rápido de operar, que el resultado sea
 * obvio, y que sea imposible registrar un ingreso por accidente.
 *
 * El flujo es: escanear → ver el sello → ajustar cuántos entran → confirmar →
 * volver a escanear. Todo con botones grandes, usable con una mano.
 */

// Vuelve solo a la cámara después de un ingreso exitoso: el operador no tiene
// que apretar nada entre invitado e invitado.
const AUTO_RESUME_MS = 2500;

// Ignora el mismo código si se relee enseguida. Sin esto, la cámara dispara
// varias veces sobre el mismo QR mientras el invitado lo sostiene.
const DUPLICATE_WINDOW_MS = 6000;

const STATION_STORAGE_KEY = "control-acceso:puesto";

/** Apaga la cámara de verdad: sin esto el led del dispositivo queda prendido. */
function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Corta una promesa que no responde.
 *
 * getUserMedia y play() pueden quedarse colgados sin resolver ni rechazar
 * —por ejemplo si el navegador nunca muestra el permiso, o si bloquea la
 * reproducción— y en ese caso el operador ve un cartel eterno sin ningún
 * error. Preferimos fallar con un mensaje concreto.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} no respondió en ${ms / 1000} segundos.`)),
        ms,
      ),
    ),
  ]);
}

/**
 * Datos del entorno para diagnosticar desde el propio teléfono, donde no hay
 * consola del navegador a mano.
 */
async function collectEnvironment(): Promise<string[]> {
  const out: string[] = [];

  out.push(`origen: ${window.location.origin}`);
  out.push(`contexto seguro: ${window.isSecureContext}`);
  out.push(`mediaDevices: ${Boolean(navigator.mediaDevices)}`);
  out.push(`getUserMedia: ${Boolean(navigator.mediaDevices?.getUserMedia)}`);

  try {
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    out.push(`permiso de cámara: ${status.state}`);
  } catch {
    out.push("permiso de cámara: no consultable en este navegador");
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    out.push(`cámaras detectadas: ${cams.length}`);
  } catch (error) {
    out.push(`cámaras: error (${(error as Error).name})`);
  }

  out.push(`navegador: ${navigator.userAgent.slice(0, 90)}`);
  return out;
}

/**
 * Traduce el error de getUserMedia a algo accionable.
 *
 * El nombre del error es lo único que distingue "no diste permiso" de "otra
 * app tiene la cámara" o "no hay cámara". Sin esto, el operador ve un mensaje
 * genérico y no sabe qué tocar.
 */
function describeCameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Bloqueaste el permiso de cámara. Tocá el candado en la barra de direcciones, permití la cámara y volvé a intentar.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No encontramos ninguna cámara en este dispositivo.";
    case "NotReadableError":
    case "TrackStartError":
      return "La cámara está en uso por otra aplicación. Cerrá la otra app y volvé a intentar.";
    case "OverconstrainedError":
      return "No hay una cámara compatible. Probá con otro dispositivo.";
    case "SecurityError":
      return "El navegador bloqueó la cámara por seguridad. La página tiene que estar en HTTPS.";
    default:
      return error instanceof Error && error.message
        ? error.message
        : "No pudimos acceder a la cámara.";
  }
}

type Phase =
  | { kind: "scanning" }
  | { kind: "checking" }
  | { kind: "result"; result: CheckInResult; code: string };

export function Scanner({
  eventId,
  eventName,
}: {
  eventId: string;
  eventName: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const [people, setPeople] = useState(1);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<"starting" | "ready" | "error">(
    "starting",
  );
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Consola en pantalla: en el celular no hay devtools a mano.
  const [logs, setLogs] = useState<string[]>([]);
  const log = useCallback((message: string) => {
    const stamp = new Date().toLocaleTimeString("es-AR", { hour12: false });
    setLogs((prev) => [...prev, `${stamp}  ${message}`]);
  }, []);

  /**
   * El puesto ("Puerta 1") queda guardado por dispositivo: se escribe una vez
   * por noche y después viaja en cada check-in.
   *
   * Va sin estado de React a propósito. localStorage no existe durante el
   * render del servidor, así que sincronizarlo con useState obligaría a un
   * setState dentro de un efecto —que React 19 desaconseja— y provocaría un
   * render extra. Un input no controlado resuelve lo mismo sin nada de eso.
   */
  const stationRef = useRef<HTMLInputElement>(null);

  const stopStream = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    stopTracks(streamRef.current);
    streamRef.current = null;
  }, []);

  function initStationInput(el: HTMLInputElement | null) {
    if (el && !el.value) el.value = localStorage.getItem(STATION_STORAGE_KEY) ?? "";
    stationRef.current = el;
  }

  function persistStation(value: string) {
    localStorage.setItem(STATION_STORAGE_KEY, value);
  }

  const handleCode = useCallback(
    (code: string) => {
      setPhase({ kind: "checking" });
      setManualError(null);

      startTransition(async () => {
        const result = await scanLookupAction(eventId, code);
        // Si puede entrar, arrancamos con todos los disponibles: el caso
        // habitual es que el grupo entero entre junto.
        if (result.result === "ALLOWED") setPeople(result.available);
        setPhase({ kind: "result", result, code });
      });
    },
    [eventId],
  );

  const onScan = useCallback(
    (text: string) => {
      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.code === text && now - last.at < DUPLICATE_WINDOW_MS) {
        return;
      }
      lastScanRef.current = { code: text, at: now };
      handleCode(text);
    },
    [handleCode],
  );

  /**
   * Enciende la cámara.
   *
   * Se intenta solo al montar, pero varios navegadores móviles —Safari en iOS
   * sobre todo— no entregan la cámara sin un gesto del usuario. Por eso la
   * función es reutilizable: si el intento automático falla, el operador la
   * activa con un toque.
   */
  const startCamera = useCallback(async () => {
    // Sin este guard, tocar el botón de reintento mientras el primer intento
    // sigue en curso pide la cámara dos veces y deja un stream huérfano.
    if (startingRef.current || controlsRef.current) return;
    startingRef.current = true;

    setCameraError(null);
    setCameraState("starting");

    try {
      for (const line of await collectEnvironment()) log(line);

      const video = videoRef.current;
      if (!video) throw new Error("El reproductor de video no está listo.");

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Este navegador no expone la cámara. Suele pasar cuando la página no está en HTTPS.",
        );
      }

      // Paso 1: pedir la cámara. Acá aparece el permiso, y acá salen los
      // errores que le importan al operador (permiso denegado, cámara en uso).
      log("pidiendo cámara…");
      const stream = await withTimeout(
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        }),
        15_000,
        "el permiso de cámara",
      );
      streamRef.current = stream;
      log(`stream obtenido (${stream.getVideoTracks()[0]?.label || "sin nombre"})`);

      // Paso 2: reproducir. Se hace a mano en vez de delegarlo en la librería
      // porque acá está la trampa: `muted` y `playsinline` tienen que estar
      // puestos como atributos del DOM, no solo como props de React, o Chrome
      // bloquea el autoplay y la reproducción nunca arranca. Cuando eso pasa,
      // la librería se queda esperando el evento de "playing" para siempre y
      // el operador ve un cartel colgado, sin error.
      video.muted = true;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.srcObject = stream;

      // `play()` sobre un video que ya está reproduciéndose ensucia la consola
      // con un warning. Pasa cuando React remonta el efecto en desarrollo o
      // cuando el operador toca reintentar.
      if (video.paused) {
        log("reproduciendo video…");
        await withTimeout(video.play(), 10_000, "la reproducción del video");
      }
      log(`video andando (${video.videoWidth}x${video.videoHeight})`);

      // Paso 3: decodificar sobre un video que ya está andando.
      log("iniciando lector de QR…");
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 150,
      });
      controlsRef.current = await withTimeout(
        reader.decodeFromVideoElement(video, (result) => {
          if (result) onScan(result.getText());
        }),
        10_000,
        "el lector de QR",
      );

      log("cámara lista");
      setCameraState("ready");
    } catch (error) {
      console.error("No se pudo iniciar la cámara", error);
      const err = error as Error;
      log(`FALLÓ: ${err.name || "Error"} — ${err.message}`);
      stopStream();
      setCameraState("error");
      setCameraError(describeCameraError(error));
      setManualOpen(true);
    } finally {
      startingRef.current = false;
    }
  }, [onScan, stopStream, log]);

  /**
   * Reintento manual. Corta lo que haya quedado a medias antes de volver a
   * pedir la cámara: si no, el guard de arriba haría que el botón no hiciera
   * absolutamente nada, que es la peor respuesta posible para el operador.
   */
  const retryCamera = useCallback(() => {
    startingRef.current = false;
    stopStream();
    void startCamera();
  }, [startCamera, stopStream]);

  useEffect(() => {
    // Diferido un tick a propósito: evita el setState síncrono dentro del
    // efecto y garantiza que el <video> ya esté montado cuando zxing le
    // enchufa el stream.
    const timer = setTimeout(() => void startCamera(), 0);

    return () => {
      clearTimeout(timer);
      stopStream();
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [startCamera, stopStream]);

  function backToScanning() {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setPhase({ kind: "scanning" });
    setManualCode("");
  }

  function confirm(code: string) {
    startTransition(async () => {
      const result = await confirmCheckInAction(
        eventId,
        code,
        people,
        stationRef.current?.value.trim() || null,
      );
      setPhase({ kind: "result", result, code });

      if (result.result === "OK") {
        resumeTimerRef.current = setTimeout(backToScanning, AUTO_RESUME_MS);
      }
    });
  }

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    const code = manualCode.trim();
    if (!code) return;

    setManualError(null);
    startTransition(async () => {
      const found = await resolveShortCodeAction(eventId, code);
      if ("error" in found) {
        setManualError(found.error);
        return;
      }
      handleCode(found.token);
    });
  }

  const showingResult = phase.kind === "result";

  return (
    <div className="flex flex-col gap-4">
      {/* Cámara. Se mantiene montada siempre; solo se oculta cuando hay un
          resultado en pantalla, para que no siga leyendo por detrás. */}
      <div className={showingResult ? "hidden" : "flex flex-col gap-3"}>
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef}
            className="aspect-square w-full object-cover"
            muted
            playsInline
          />

          {cameraState === "error" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
              <CameraOff size={32} className="text-deny" />
              <p className="text-sm text-muted">{cameraError}</p>
              <button
                type="button"
                onClick={retryCamera}
                className="rounded-xl bg-brand px-5 py-3 font-semibold text-brand-foreground"
              >
                Activar cámara
              </button>
            </div>
          ) : cameraState === "starting" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
              <Camera size={32} className="text-muted" />
              <p className="text-sm text-muted">Iniciando cámara…</p>
              {/* Algunos navegadores móviles no entregan la cámara sin un
                  gesto del usuario, y en ese caso el intento automático se
                  queda esperando sin lanzar error. */}
              <button
                type="button"
                onClick={retryCamera}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium"
              >
                Si no arranca, tocá acá
              </button>
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-3/5 w-3/5 rounded-2xl border-4 border-white/70" />
            </div>
          )}

          {phase.kind === "checking" ? (
            <div className="absolute inset-x-0 bottom-0 bg-black/70 py-3 text-center text-sm font-medium text-white">
              Verificando…
            </div>
          ) : null}
        </div>

        <p className="text-center text-sm text-muted">
          Apuntá al código QR de la invitación.
        </p>
      </div>

      {/* Resultado */}
      {phase.kind === "result" ? (
        <ResultStamp result={phase.result} eventName={eventName}>
          {phase.result.result === "ALLOWED" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">¿Cuántas personas ingresan?</p>

              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  aria-label="Menos personas"
                  onClick={() => setPeople((n) => Math.max(1, n - 1))}
                  disabled={pending || people <= 1}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/25 text-white disabled:opacity-40"
                >
                  <Minus size={26} />
                </button>

                <span className="min-w-14 text-4xl font-extrabold tabular-nums">
                  {people}
                </span>

                <button
                  type="button"
                  aria-label="Más personas"
                  onClick={() =>
                    setPeople((n) =>
                      Math.min(
                        phase.result.result === "ALLOWED"
                          ? phase.result.available
                          : n,
                        n + 1,
                      ),
                    )
                  }
                  disabled={
                    pending ||
                    (phase.result.result === "ALLOWED" &&
                      people >= phase.result.available)
                  }
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/25 text-white disabled:opacity-40"
                >
                  <Plus size={26} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => confirm(phase.code)}
                disabled={pending}
                className="w-full rounded-xl bg-white px-5 py-4 text-lg font-bold text-ok disabled:opacity-60"
              >
                {pending ? "Registrando…" : "CONFIRMAR INGRESO"}
              </button>

              <button
                type="button"
                onClick={backToScanning}
                disabled={pending}
                className="w-full rounded-xl border-2 border-white/50 px-5 py-3 font-semibold"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={backToScanning}
              className="w-full rounded-xl bg-white/20 px-5 py-4 text-lg font-bold"
            >
              {phase.result.result === "OK"
                ? "ESCANEAR SIGUIENTE"
                : "VOLVER"}
            </button>
          )}
        </ResultStamp>
      ) : null}

      {/* Respaldo manual y puesto */}
      {!showingResult ? (
        <div className="flex flex-col gap-3">
          {manualOpen ? (
            <form
              onSubmit={submitManual}
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4"
            >
              <label htmlFor="manual" className="text-sm font-medium">
                Código de la invitación
              </label>
              <input
                id="manual"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                placeholder="ABCD2345"
                autoCapitalize="characters"
                autoComplete="off"
                className="rounded-lg border border-border px-3 py-3 text-center font-mono text-xl tracking-widest uppercase"
              />
              {manualError ? (
                <p role="alert" className="text-sm text-deny">
                  {manualError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={pending || !manualCode.trim()}
                className="rounded-lg bg-brand px-4 py-3 font-semibold text-brand-foreground disabled:opacity-60"
              >
                Buscar
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium"
            >
              <Keyboard size={16} />
              El QR no se lee — ingresar código
            </button>
          )}

          {/* Consola en pantalla. En el celular no hay devtools, así que el
              diagnóstico tiene que vivir dentro de la app. */}
          <details className="rounded-xl border border-border bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Diagnóstico de la cámara
            </summary>
            <div className="border-t border-border px-4 py-3">
              <pre className="max-h-64 overflow-auto text-[11px] leading-relaxed break-words whitespace-pre-wrap text-muted">
                {logs.length > 0 ? logs.join("\n") : "Sin registros todavía."}
              </pre>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(logs.join("\n"))
                    .catch(() => window.prompt("Copiá el diagnóstico:", logs.join(" | ")));
                }}
                className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
              >
                Copiar diagnóstico
              </button>
            </div>
          </details>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="station"
              className="flex items-center gap-2 text-sm text-muted"
            >
              <span className="shrink-0">Puesto:</span>
              <input
                id="station"
                ref={initStationInput}
                onChange={(e) => persistStation(e.target.value)}
                placeholder="Puerta 1"
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
              />
            </label>
            <p className="text-xs text-muted">
              Opcional. Si el salón tiene más de una entrada, poné cuál es esta
              y el historial va a mostrar por dónde entró cada invitado. Con una
              sola puerta, dejalo vacío.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
