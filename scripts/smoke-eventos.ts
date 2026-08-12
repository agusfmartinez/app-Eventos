/**
 * Smoke test de la Fase 2: eventos e invitados.
 *
 * Requiere el server de desarrollo corriendo y la base levantada.
 *
 *   npm run test:eventos
 *
 * Crea sus propios datos con un prefijo reconocible y los borra al terminar,
 * incluso si algo falla — no deja basura en la base de desarrollo.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";
import { InvitationStatus } from "../lib/generated/prisma/enums";
import { deriveStatus } from "../lib/invitation-status";
import { generateInvitationToken, generateShortCode } from "../lib/tokens";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const USERNAME = process.env.SEED_ADMIN_USERNAME ?? "ASALON";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
const MARKER = `SMOKE-${Date.now()}`;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ---------- helpers HTTP ----------

const jar = new Map<string, string>();

function saveCookies(res: Response) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    redirect: "manual",
    ...opts,
    headers: { cookie: cookieHeader(), ...(opts.headers ?? {}) },
  });
  saveCookies(res);
  return res;
}

async function login() {
  const csrfRes = await req("/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  await req("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      username: USERNAME,
      password: PASSWORD,
    }).toString(),
  });
  if (![...jar.keys()].some((k) => k.includes("session-token"))) {
    throw new Error("No se pudo iniciar sesión: revisá el seed del admin.");
  }
}

// ---------- resultados ----------

const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") =>
  results.push({ name, pass, detail });

// ---------- test ----------

let eventId = "";

async function run() {
  await login();

  // --- datos de prueba ---
  const event = await prisma.event.create({
    data: {
      name: `${MARKER} Casamiento`,
      eventDate: new Date("2026-12-31T00:00:00.000Z"),
      startTime: "21:00",
      endTime: "05:00", // termina de madrugada: caso legítimo
      location: "Salón principal",
      status: "PUBLISHED",
    },
    select: { id: true },
  });
  eventId = event.id;

  const guest = await prisma.guest.create({
    data: {
      eventId,
      firstName: "Juan",
      lastName: `Perez${MARKER}`,
      phone: "1122334455",
    },
    select: { id: true },
  });

  const invitation = await prisma.invitation.create({
    data: {
      guestId: guest.id,
      eventId,
      token: generateInvitationToken(),
      shortCode: generateShortCode(),
      maxPeople: 4,
      status: InvitationStatus.ENABLED,
    },
    select: { id: true, token: true, shortCode: true },
  });

  // --- 1. el token del QR es aleatorio y largo ---
  check(
    "el token de invitación es largo y aleatorio",
    invitation.token.length >= 40 && !/^[0-9]+$/.test(invitation.token),
    `token.length=${invitation.token.length}`,
  );

  // --- 2. el código corto no tiene caracteres ambiguos ---
  check(
    "el código corto evita 0/O/1/I",
    /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(invitation.shortCode),
    `shortCode=${invitation.shortCode}`,
  );

  // --- 3. el evento aparece en el panel ---
  let res = await req("/panel");
  let html = await res.text();
  check(
    "el evento aparece en el panel",
    res.status === 200 && html.includes(`${MARKER} Casamiento`),
    `status=${res.status}`,
  );

  // --- 4. el detalle muestra al invitado con su cupo ---
  res = await req(`/panel/eventos/${eventId}`);
  html = await res.text();
  check(
    "el detalle muestra al invitado, su código y su cupo",
    res.status === 200 &&
      html.includes(`Perez${MARKER}`) &&
      html.includes(invitation.shortCode) &&
      html.includes("0/4"),
    `status=${res.status}`,
  );

  // --- 5. la búsqueda por teléfono encuentra al invitado ---
  res = await req(`/panel/eventos/${eventId}?q=1122334455`);
  html = await res.text();
  check(
    "la búsqueda por teléfono lo encuentra",
    html.includes(`Perez${MARKER}`),
    "",
  );

  // --- 6. la búsqueda que no coincide lo excluye ---
  res = await req(`/panel/eventos/${eventId}?q=zzzznoexiste`);
  html = await res.text();
  check(
    "la búsqueda sin coincidencias no lo muestra",
    !html.includes(`Perez${MARKER}`),
    "",
  );

  // --- 7. estados derivados, no guardados ---
  check(
    "estado derivado: 0 de 4 = habilitado",
    deriveStatus({ status: "ENABLED", maxPeople: 4, enteredCount: 0 }) ===
      "ENABLED",
  );
  check(
    "estado derivado: 2 de 4 = parcial",
    deriveStatus({ status: "ENABLED", maxPeople: 4, enteredCount: 2 }) ===
      "PARTIAL",
  );
  check(
    "estado derivado: 4 de 4 = ingresó",
    deriveStatus({ status: "ENABLED", maxPeople: 4, enteredCount: 4 }) ===
      "ENTERED",
  );
  check(
    "estado derivado: bloqueado gana sobre el conteo",
    deriveStatus({ status: "BLOCKED", maxPeople: 4, enteredCount: 2 }) ===
      "BLOCKED",
  );

  // --- 8. no se puede bajar el cupo por debajo de lo ya ingresado ---
  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { enteredCount: 3 },
  });

  let rejected = false;
  try {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { maxPeople: 2 }, // 3 ya ingresaron: la base tiene que rechazarlo
    });
  } catch {
    rejected = true;
  }
  check(
    "la base rechaza bajar el cupo por debajo de lo ya ingresado",
    rejected,
  );

  // --- 9. el shortCode es único por evento ---
  let duplicateRejected = false;
  try {
    const otherGuest = await prisma.guest.create({
      data: { eventId, firstName: "Ana", lastName: `Gomez${MARKER}` },
      select: { id: true },
    });
    await prisma.invitation.create({
      data: {
        guestId: otherGuest.id,
        eventId,
        token: generateInvitationToken(),
        shortCode: invitation.shortCode, // mismo código, mismo evento
        maxPeople: 1,
      },
    });
  } catch {
    duplicateRejected = true;
  }
  check(
    "el código corto no se puede repetir dentro del mismo evento",
    duplicateRejected,
  );

  // --- 10. la página del invitado carga y respeta el evento de la URL ---
  res = await req(`/panel/eventos/${eventId}/invitados/${guest.id}`);
  check(
    "la ficha del invitado carga",
    res.status === 200,
    `status=${res.status}`,
  );

  const otherEvent = await prisma.event.create({
    data: {
      name: `${MARKER} Otro`,
      eventDate: new Date("2026-12-30T00:00:00.000Z"),
    },
    select: { id: true },
  });
  res = await req(`/panel/eventos/${otherEvent.id}/invitados/${guest.id}`);
  check(
    "un invitado no se puede abrir desde otro evento",
    res.status === 404,
    `status=${res.status}`,
  );
}

async function cleanup() {
  // El borrado del evento arrastra invitados e invitaciones por cascada.
  await prisma.event.deleteMany({ where: { name: { startsWith: MARKER } } });
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
