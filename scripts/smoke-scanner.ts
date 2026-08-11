/**
 * Smoke test del control de acceso: rutas y permisos del rol DOOR.
 *
 *   npm run test:scanner   (requiere el server corriendo)
 *
 * La concurrencia se prueba aparte, en test:concurrencia. Acá lo que importa
 * es el aislamiento: un operador de puerta no debe poder entrar al panel ni
 * operar sobre eventos que no le asignaron.
 */
import "dotenv/config";

import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";
import { Role } from "../lib/generated/prisma/enums";
import { generateInvitationToken, generateShortCode } from "../lib/tokens";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const MARKER = `SMOKESCAN-${Date.now()}`;
const DOOR_EMAIL = `puerta-${Date.now()}@smoke.local`;
const DOOR_PASSWORD = "puerta12345";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") =>
  results.push({ name, pass, detail });

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

  async function login(email: string, password: string) {
    const { csrfToken } = (await (await req("/api/auth/csrf")).json()) as {
      csrfToken: string;
    };
    await req("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken, email, password }).toString(),
    });
    return [...jar.keys()].some((k) => k.includes("session-token"));
  }

  return { req, login };
}

const locationOf = (res: Response) => res.headers.get("location") ?? "";

async function run() {
  // --- datos ---
  const assigned = await prisma.event.create({
    data: {
      name: `${MARKER} Asignado`,
      eventDate: new Date("2026-12-31T00:00:00.000Z"),
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  const foreign = await prisma.event.create({
    data: {
      name: `${MARKER} Ajeno`,
      eventDate: new Date("2026-12-30T00:00:00.000Z"),
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  // Un borrador no debe aparecer en el selector de la puerta. Solo se
  // comprueba por su nombre, así que no hace falta guardar el id.
  await prisma.event.create({
    data: {
      name: `${MARKER} Borrador`,
      eventDate: new Date("2026-12-29T00:00:00.000Z"),
      status: "DRAFT",
    },
    select: { id: true },
  });

  const door = await prisma.user.create({
    data: {
      email: DOOR_EMAIL,
      passwordHash: await hash(DOOR_PASSWORD),
      fullName: `Operador ${MARKER}`,
      role: Role.DOOR,
    },
    select: { id: true },
  });

  await prisma.eventStaff.create({
    data: { eventId: assigned.id, userId: door.id, stationLabel: "Puerta 1" },
    select: { eventId: true },
  });

  const guest = await prisma.guest.create({
    data: { eventId: assigned.id, firstName: "Ana", lastName: `Gomez${MARKER}` },
    select: { id: true },
  });

  await prisma.invitation.create({
    data: {
      guestId: guest.id,
      eventId: assigned.id,
      token: generateInvitationToken(),
      shortCode: generateShortCode(),
      maxPeople: 2,
    },
    select: { id: true },
  });

  // --- sesión del operador de puerta ---
  const doorSession = makeJar();
  check(
    "el operador de puerta puede iniciar sesión",
    await doorSession.login(DOOR_EMAIL, DOOR_PASSWORD),
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

  // 3. ve solo los eventos asignados y publicados
  res = await doorSession.req("/control");
  let html = await res.text();
  check(
    "ve el evento al que está asignado",
    res.status === 200 && html.includes(`${MARKER} Asignado`),
    `status=${res.status}`,
  );
  check(
    "no ve eventos de otros operadores",
    !html.includes(`${MARKER} Ajeno`),
  );

  // 4. no puede escanear en un evento que no le asignaron
  res = await doorSession.req(`/control/${foreign.id}`);
  check(
    "no puede abrir el scanner de un evento ajeno",
    locationOf(res).includes("/sin-acceso"),
    `status=${res.status} location=${locationOf(res)}`,
  );

  // 5. sí puede abrir el suyo
  res = await doorSession.req(`/control/${assigned.id}`);
  check(
    "puede abrir el scanner de su evento",
    res.status === 200,
    `status=${res.status}`,
  );

  // --- sesión del admin ---
  const adminSession = makeJar();
  await adminSession.login(
    process.env.SEED_ADMIN_EMAIL ?? "admin@salon.local",
    process.env.SEED_ADMIN_PASSWORD ?? "admin1234",
  );

  res = await adminSession.req("/control");
  html = await res.text();
  check(
    "el admin ve todos los eventos publicados",
    html.includes(`${MARKER} Asignado`) && html.includes(`${MARKER} Ajeno`),
  );
  check(
    "el selector no ofrece eventos en borrador",
    !html.includes(`${MARKER} Borrador`),
    "un borrador no debería aparecer en la puerta",
  );

  res = await adminSession.req(`/control/${foreign.id}`);
  check(
    "el admin puede escanear en cualquier evento",
    res.status === 200,
    `status=${res.status}`,
  );

  // 6. sin sesión no se llega al scanner
  const anon = makeJar();
  res = await anon.req(`/control/${assigned.id}`);
  check(
    "sin sesión, el scanner manda al login",
    locationOf(res).includes("/login"),
    `location=${locationOf(res)}`,
  );
}

async function cleanup() {
  await prisma.event.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.user.deleteMany({ where: { email: DOOR_EMAIL } });
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
