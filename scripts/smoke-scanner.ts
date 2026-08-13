/**
 * Smoke test del control de acceso: escaneo libre, ventana horaria y permisos.
 *
 *   npm run test:scanner   (requiere el server corriendo)
 *
 * La concurrencia se prueba aparte, en test:concurrencia. Acá importan dos
 * cosas: que el QR resuelva el evento correcto —y solo entre los que están
 * abiertos ahora— y que recepción no pueda tocar nada.
 */
import "dotenv/config";

import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";

import type { CurrentUser } from "../lib/authz";
import { lookupInvitationAmong } from "../lib/checkin";
import { PrismaClient } from "../lib/generated/prisma/client";
import { Role } from "../lib/generated/prisma/enums";
import { listScannableEvents } from "../lib/scanning";
import { generateInvitationToken, generateShortCode } from "../lib/tokens";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const MARKER = `SMOKESCAN-${Date.now()}`;
const DOOR_USERNAME = `TESTSCAN${Date.now()}`;
const DOOR_PASSWORD = "puerta12345";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") =>
  results.push({ name, pass, detail });

// ---------- fechas ----------

/** El salón está en UTC-3 todo el año: no hay horario de verano desde 2009. */
const VENUE_OFFSET_H = 3;

/** Columna DATE: Prisma la quiere a medianoche UTC. */
function dateOnly(daysFromToday: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d;
}

/** Instante real correspondiente a una hora del reloj del salón. */
function venueTime(date: Date, hour: number, minute = 0): Date {
  return new Date(date.getTime() + (hour + VENUE_OFFSET_H) * 3_600_000 + minute * 60_000);
}

// ---------- sesión ----------

function makeJar() {
  const jar = new Map<string, string>();

  function save(res: Response) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  async function req(path: string, opts: RequestInit = {}) {
    const res = await fetch(BASE + path, {
      redirect: "manual",
      ...opts,
      headers: {
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(opts.headers ?? {}),
      },
    });
    save(res);
    return res;
  }

  async function login(username: string, password: string) {
    const { csrfToken } = (await (await req("/api/auth/csrf")).json()) as {
      csrfToken: string;
    };
    await req("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken, username, password }).toString(),
    });
    return [...jar.keys()].some((k) => k.includes("session-token"));
  }

  return { req, login };
}

const locationOf = (res: Response) => res.headers.get("location") ?? "";

async function run() {
  const today = dateOnly(0);

  // --- datos ---
  // Todos los eventos son de hoy: con el escaneo libre, la puerta solo
  // atiende lo que está abierto ahora.
  const assigned = await prisma.event.create({
    data: {
      name: `${MARKER} Asignado`,
      eventDate: today,
      startTime: "21:00",
      endTime: "05:00",
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  const foreign = await prisma.event.create({
    data: {
      name: `${MARKER} Ajeno`,
      eventDate: today,
      startTime: "21:00",
      endTime: "05:00",
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  // Un borrador no debe poder recibir gente aunque sea de hoy.
  const draft = await prisma.event.create({
    data: {
      name: `${MARKER} Borrador`,
      eventDate: today,
      startTime: "21:00",
      endTime: "05:00",
      status: "DRAFT",
    },
    select: { id: true },
  });

  const door = await prisma.user.create({
    data: {
      username: DOOR_USERNAME,
      passwordHash: await hash(DOOR_PASSWORD),
      firstName: "Operador",
      lastName: MARKER,
      role: Role.DOOR,
      mustChangePassword: false,
    },
    select: { id: true },
  });

  await prisma.eventStaff.createMany({
    data: [
      { eventId: assigned.id, userId: door.id, stationLabel: "Puerta 1" },
      // También al borrador: el filtro tiene que ser por estado, no solo por
      // asignación.
      { eventId: draft.id, userId: door.id, stationLabel: null },
    ],
  });

  const guest = await prisma.guest.create({
    data: { eventId: assigned.id, firstName: "Ana", lastName: `Gomez${MARKER}` },
    select: { id: true },
  });

  const token = generateInvitationToken();
  await prisma.invitation.create({
    data: {
      guestId: guest.id,
      eventId: assigned.id,
      token,
      shortCode: generateShortCode(),
      maxPeople: 2,
    },
    select: { id: true },
  });

  // Invitado del evento ajeno, para probar el rechazo del escaneo libre.
  const foreignGuest = await prisma.guest.create({
    data: { eventId: foreign.id, firstName: "Beto", lastName: `Ruiz${MARKER}` },
    select: { id: true },
  });

  const foreignToken = generateInvitationToken();
  await prisma.invitation.create({
    data: {
      guestId: foreignGuest.id,
      eventId: foreign.id,
      token: foreignToken,
      shortCode: generateShortCode(),
      maxPeople: 1,
    },
    select: { id: true },
  });

  // --- ventana de escaneo (sin HTTP: es lógica pura contra la base) ---

  const doorUser: CurrentUser = {
    id: door.id,
    username: DOOR_USERNAME,
    email: null,
    firstName: "Operador",
    lastName: MARKER,
    fullName: `Operador ${MARKER}`,
    role: Role.DOOR,
    mustChangePassword: false,
  };

  const duringParty = await listScannableEvents(doorUser, venueTime(today, 23));
  const names = duringParty.map((e) => e.name);

  check(
    "durante la fiesta, el operador ve el evento asignado",
    names.includes(`${MARKER} Asignado`),
    names.join(", "),
  );
  check(
    "no ve eventos de otros operadores",
    !names.includes(`${MARKER} Ajeno`),
  );
  check(
    "un borrador no se puede escanear ni estando asignado",
    !names.includes(`${MARKER} Borrador`),
  );

  // La trampa del ROADMAP: a las 03:00 del día siguiente la fiesta de anoche
  // sigue en curso. Filtrar por event_date = hoy la dejaría afuera.
  const atThreeAM = await listScannableEvents(
    doorUser,
    venueTime(dateOnly(1), 3),
  );
  check(
    "a las 03:00 del día siguiente la fiesta de anoche sigue abierta",
    atThreeAM.some((e) => e.name === `${MARKER} Asignado`),
    atThreeAM.map((e) => e.name).join(", "),
  );

  // Y a las 10:00, con la fiesta terminada a las 05:00, ya no.
  const nextMorning = await listScannableEvents(
    doorUser,
    venueTime(dateOnly(1), 10),
  );
  check(
    "a la mañana siguiente el evento ya no se puede escanear",
    !nextMorning.some((e) => e.name === `${MARKER} Asignado`),
    nextMorning.map((e) => e.name).join(", "),
  );

  // --- el QR resuelve el evento ---

  const allowed = new Set(duringParty.map((e) => e.id));

  const ownScan = await lookupInvitationAmong(token, allowed);
  check(
    "el QR de un invitado propio queda autorizado",
    ownScan.result.result === "ALLOWED" &&
      ownScan.event?.id === assigned.id,
    ownScan.result.result,
  );

  const foreignScan = await lookupInvitationAmong(foreignToken, allowed);
  check(
    "el QR de un evento que no atiende se rechaza y dice de cuál es",
    foreignScan.result.result === "WRONG_EVENT" &&
      foreignScan.event?.name === `${MARKER} Ajeno`,
    foreignScan.result.result,
  );

  const bogusScan = await lookupInvitationAmong("no-existe", allowed);
  check(
    "un código inexistente no resuelve ningún evento",
    bogusScan.result.result === "NOT_FOUND" && bogusScan.event === null,
    bogusScan.result.result,
  );

  // --- sesión del operador de puerta ---
  const doorSession = makeJar();
  check(
    "el operador de puerta puede iniciar sesión",
    await doorSession.login(DOOR_USERNAME, DOOR_PASSWORD),
  );

  // 1. la raíz lo manda al scanner, no al panel
  let res = await doorSession.req("/");
  check(
    "al entrar, el rol DOOR va directo al scanner",
    locationOf(res).includes("/control"),
    `location=${locationOf(res)}`,
  );

  // 2. no puede entrar al panel administrativo
  res = await doorSession.req("/panel");
  check(
    "el rol DOOR no puede abrir el panel",
    locationOf(res).includes("/sin-acceso"),
    `status=${res.status} location=${locationOf(res)}`,
  );

  res = await doorSession.req(`/panel/eventos/${assigned.id}`);
  check(
    "el rol DOOR tampoco puede abrir un evento del panel",
    locationOf(res).includes("/sin-acceso"),
    `location=${locationOf(res)}`,
  );

  // 3. el escáner abre sin elegir evento
  res = await doorSession.req("/control");
  let html = await res.text();
  check(
    "el control abre directo en el escáner",
    res.status === 200 && html.includes("Apuntá al código QR"),
    `status=${res.status}`,
  );

  // 4. la lista de eventos, en su propia pantalla y acotada al acceso
  res = await doorSession.req("/control/eventos");
  html = await res.text();
  check(
    "la lista muestra el evento asignado",
    res.status === 200 && html.includes(`${MARKER} Asignado`),
    `status=${res.status}`,
  );
  check(
    "la lista no muestra eventos ajenos",
    res.status === 200 && !html.includes(`${MARKER} Ajeno`),
  );
  check(
    "la lista no muestra borradores",
    res.status === 200 && !html.includes(`${MARKER} Borrador`),
  );

  // 5. la ficha de un evento ajeno sigue cerrada
  res = await doorSession.req(`/control/${foreign.id}`);
  check(
    "no puede abrir la ficha de un evento ajeno",
    locationOf(res).includes("/sin-acceso"),
    `status=${res.status} location=${locationOf(res)}`,
  );

  // 6. la del suyo se abre, en modo lectura
  res = await doorSession.req(`/control/${assigned.id}`);
  html = await res.text();
  check(
    "puede abrir la ficha de su evento",
    res.status === 200,
    `status=${res.status}`,
  );
  check(
    "la ficha lista a los invitados para poder buscarlos",
    res.status === 200 && html.includes(`Gomez${MARKER}`),
  );
  check(
    "la ficha avisa que es de solo lectura",
    res.status === 200 && html.includes("solo lectura"),
  );

  // --- sesión del admin ---
  const adminSession = makeJar();
  await adminSession.login(
    process.env.SEED_ADMIN_USERNAME ?? "ASALON",
    process.env.SEED_ADMIN_PASSWORD ?? "admin1234",
  );

  res = await adminSession.req("/control/eventos");
  html = await res.text();
  check(
    "el admin ve todos los eventos",
    html.includes(`${MARKER} Asignado`) && html.includes(`${MARKER} Ajeno`),
  );

  res = await adminSession.req(`/control/${foreign.id}`);
  check(
    "el admin puede abrir la ficha de cualquier evento",
    res.status === 200,
    `status=${res.status}`,
  );

  // 7. sin sesión no se llega al control
  const anon = makeJar();
  res = await anon.req("/control");
  check(
    "sin sesión, el control manda al login",
    locationOf(res).includes("/login"),
    `location=${locationOf(res)}`,
  );
}

async function cleanup() {
  await prisma.event.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.user.deleteMany({ where: { username: DOOR_USERNAME } });
}

async function main() {
  try {
    await run();
  } catch (error) {
    check("el test corrió sin excepciones", false, String(error));
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }

  for (const r of results) {
    console.log(
      `${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : `  << ${r.detail}`}`,
    );
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? "\nTodo OK" : `\n${failed} fallaron`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
