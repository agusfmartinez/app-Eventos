import "server-only";

/**
 * Limitador de ventana deslizante en memoria.
 *
 * LIMITACIÓN IMPORTANTE: el estado vive en el proceso. Con un solo contenedor
 * —que es el despliegue previsto— alcanza para frenar la fuerza bruta contra
 * /i/:token. Si algún día hay más de una instancia, cada una contaría por
 * separado y el límite real se multiplicaría: ahí hay que mover esto a Redis
 * o al reverse proxy.
 */
const buckets = new Map<string, number[]>();

// Sin esto el Map crece sin techo: cada IP nueva deja una entrada para siempre.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60_000;

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, times] of buckets) {
    const alive = times.filter((t) => now - t < windowMs);
    if (alive.length === 0) buckets.delete(key);
    else buckets.set(key, alive);
  }
}

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  sweep(now, windowMs);

  const times = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (times.length >= limit) {
    const oldest = times[0];
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  times.push(now);
  buckets.set(key, times);
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * IP del cliente. Detrás de Caddy llega en x-forwarded-for; el primer valor es
 * el cliente original.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
