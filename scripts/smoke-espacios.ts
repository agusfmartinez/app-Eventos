/**
 * Smoke test de espacios, cupo y detección de doble reserva.
 *
 *   npm run test:espacios   (requiere el server corriendo)
 *
 * El foco está en el cálculo de solapamientos: es la base sobre la que se va a
 * construir el calendario de disponibilidad, y el caso que más fácil se rompe
 * es la fiesta que termina de madrugada.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { collectValues } from "../lib/form-state";
import { PrismaClient } from "../lib/generated/prisma/client";
import {
  describeScheduleConflicts,
  eventInterval,
  findScheduleConflicts,
  overlaps,
} from "../lib/schedule";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const MARKER = `SMOKESP-${Date.now()}`;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") =>
  results.push({ name, pass, detail });

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const span = (date: string, startTime: string | null, endTime: string | null) =>
  eventInterval({ eventDate: day(date), startTime, endTime });

async function run() {
  // ======================================================
  // 1. Cálculo de franjas — lógica pura, sin base
  // ======================================================

  check(
    "dos eventos del mismo día que no se tocan no se pisan",
    !overlaps(span("2026-11-15", "14:00", "18:00"), span("2026-11-15", "20:00", "23:00")),
  );

  check(
    "dos eventos del mismo día que se tocan sí se pisan",
    overlaps(span("2026-11-15", "14:00", "19:00"), span("2026-11-15", "18:00", "23:00")),
  );

  // El caso que da sentido a todo esto.
  check(
    "una fiesta de 21:00 a 05:00 sigue ocupando la madrugada siguiente",
    overlaps(span("2026-11-15", "21:00", "05:00"), span("2026-11-16", "03:00", "08:00")),
    "un evento a las 03:00 del día siguiente debería dar conflicto",
  );

  check(
    "pero libera la mañana una vez que terminó",
    !overlaps(span("2026-11-15", "21:00", "05:00"), span("2026-11-16", "06:00", "10:00")),
  );

  check(
    "un evento sin hora de fin ocupa hasta el final del día",
    overlaps(span("2026-11-15", "14:00", null), span("2026-11-15", "22:00", "23:00")),
  );

  check(
    "un evento sin hora de fin no invade el día siguiente",
    !overlaps(span("2026-11-15", "14:00", null), span("2026-11-16", "01:00", "05:00")),
  );

  check(
    "eventos en días distintos y horarios diurnos no se pisan",
    !overlaps(span("2026-11-15", "12:00", "18:00"), span("2026-11-16", "12:00", "18:00")),
  );

  // ======================================================
  // 2. Detección contra la base
  // ======================================================

  const salonA = await prisma.space.create({
    data: { name: `${MARKER} Salón A`, capacity: 100 },
    select: { id: true },
  });
  const salonB = await prisma.space.create({
    data: { name: `${MARKER} Salón B`, capacity: 40 },
    select: { id: true },
  });

  // Casamiento del 15 que termina a las 05:00 del 16.
  await prisma.event.create({
    data: {
      name: `${MARKER} Casamiento`,
      eventDate: day("2026-11-15"),
      startTime: "21:00",
      endTime: "05:00",
      spaceId: salonA.id,
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  const madrugada = {
    eventDate: day("2026-11-16"),
    startTime: "03:00",
    endTime: "07:00",
  };

  let conflicts = await findScheduleConflicts({
    spaceId: salonA.id,
    event: madrugada,
  });
  check(
    "la base detecta el conflicto de madrugada en el mismo espacio",
    conflicts.length === 1 && conflicts[0].name === `${MARKER} Casamiento`,
    `conflictos=${conflicts.length}`,
  );

  conflicts = await findScheduleConflicts({
    spaceId: salonB.id,
    event: madrugada,
  });
  check(
    "el mismo horario en otro espacio está libre",
    conflicts.length === 0,
    `conflictos=${conflicts.length}`,
  );

  conflicts = await findScheduleConflicts({
    spaceId: null,
    event: madrugada,
  });
  check(
    "sin espacio asignado no se reporta conflicto",
    conflicts.length === 0,
  );

  // Un borrador es una pre-reserva: tiene que ocupar.
  const borrador = await prisma.event.create({
    data: {
      name: `${MARKER} Pre-reserva`,
      eventDate: day("2026-11-20"),
      startTime: "20:00",
      endTime: "02:00",
      spaceId: salonB.id,
      status: "DRAFT",
    },
    select: { id: true },
  });

  conflicts = await findScheduleConflicts({
    spaceId: salonB.id,
    event: { eventDate: day("2026-11-20"), startTime: "22:00", endTime: "23:00" },
  });
  check(
    "un borrador ocupa el espacio: es una pre-reserva",
    conflicts.length === 1,
    `conflictos=${conflicts.length}`,
  );

  // Un cancelado no ocupa nada.
  await prisma.event.update({
    where: { id: borrador.id },
    data: { status: "CANCELLED" },
    select: { id: true },
  });

  conflicts = await findScheduleConflicts({
    spaceId: salonB.id,
    event: { eventDate: day("2026-11-20"), startTime: "22:00", endTime: "23:00" },
  });
  check(
    "un evento cancelado libera el espacio",
    conflicts.length === 0,
    `conflictos=${conflicts.length}`,
  );

  // El propio evento no debe reportarse como conflicto de sí mismo.
  const propio = await prisma.event.findFirstOrThrow({
    where: { name: `${MARKER} Casamiento` },
    select: { id: true, eventDate: true, startTime: true, endTime: true },
  });
  conflicts = await findScheduleConflicts({
    spaceId: salonA.id,
    event: propio,
    excludeEventId: propio.id,
  });
  check(
    "un evento no se reporta en conflicto consigo mismo",
    conflicts.length === 0,
  );

  // ======================================================
  // 3. Mensaje de rechazo
  // ======================================================
  {
    const choque = await findScheduleConflicts({
      spaceId: salonA.id,
      event: madrugada,
    });
    const message = describeScheduleConflicts(choque, "Salón A");

    check(
      "el rechazo dice con qué evento choca y en qué horario",
      message.includes(`${MARKER} Casamiento`) &&
        message.includes("15/11") &&
        message.includes("21:00") &&
        message.includes("05:00"),
      message,
    );
    check(
      "el rechazo sugiere qué hacer",
      message.includes("otro espacio") || message.includes("sin asignar"),
      message,
    );
  }

  // ======================================================
  // 4. Repoblado del formulario tras un error
  // ======================================================
  {
    const fd = new FormData();
    fd.set("name", "Salón nuevo");
    fd.set("capacity", "80");
    fd.set("notes", "con patio");
    // "active" no se agrega: así llega un checkbox desmarcado.

    const values = collectValues(fd);

    check(
      "los valores enviados se devuelven para repoblar el formulario",
      values.name === "Salón nuevo" &&
        values.capacity === "80" &&
        values.notes === "con patio",
      JSON.stringify(values),
    );
    check(
      "un checkbox desmarcado se distingue de uno ausente",
      !("active" in values),
      "si estuviera presente, el formulario lo volvería a marcar",
    );
  }

  // ======================================================
  // 5. Interfaz
  // ======================================================

  const jar = new Map<string, string>();
  async function req(path: string, opts: RequestInit = {}) {
    const res = await fetch(BASE + path, {
      redirect: "manual",
      ...opts,
      headers: {
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        "ngrok-skip-browser-warning": "1",
        ...(opts.headers ?? {}),
      },
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
    return res;
  }

  const { csrfToken } = (await (await req("/api/auth/csrf")).json()) as {
    csrfToken: string;
  };
  await req("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      email: process.env.SEED_ADMIN_EMAIL ?? "admin@salon.local",
      password: process.env.SEED_ADMIN_PASSWORD ?? "admin1234",
    }).toString(),
  });

  let res = await req("/panel/espacios");
  let html = await res.text();
  check(
    "la pantalla de espacios lista los espacios",
    res.status === 200 && html.includes(`${MARKER} Salón A`),
    `status=${res.status}`,
  );

  // El aviso de solapamiento en la ficha del evento.
  const solapado = await prisma.event.create({
    data: {
      name: `${MARKER} Solapado`,
      eventDate: day("2026-11-16"),
      startTime: "03:00",
      endTime: "07:00",
      spaceId: salonA.id,
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  res = await req(`/panel/eventos/${solapado.id}`);
  html = await res.text();
  check(
    "la ficha avisa del solapamiento",
    res.status === 200 &&
      html.includes("Se superpone con") &&
      html.includes(`${MARKER} Casamiento`),
    `status=${res.status}`,
  );

  // El aviso de cupo excedido.
  const conCupo = await prisma.event.create({
    data: {
      name: `${MARKER} Cupo`,
      eventDate: day("2026-11-25"),
      status: "PUBLISHED",
      maxGuests: 3,
    },
    select: { id: true },
  });
  const guest = await prisma.guest.create({
    data: { eventId: conCupo.id, firstName: "Ana", lastName: `Cupo${MARKER}` },
    select: { id: true },
  });
  await prisma.invitation.create({
    data: {
      guestId: guest.id,
      eventId: conCupo.id,
      token: `tok-${MARKER}`,
      shortCode: "ABCD2345",
      maxPeople: 10, // supera el cupo de 3
    },
    select: { id: true },
  });

  res = await req(`/panel/eventos/${conCupo.id}`);
  html = await res.text();
  check(
    "la ficha avisa cuando se supera el cupo pactado",
    res.status === 200 && html.includes("Se superó el cupo"),
    `status=${res.status}`,
  );

  // Y no avisa cuando no se supera.
  await prisma.event.update({
    where: { id: conCupo.id },
    data: { maxGuests: 20 },
    select: { id: true },
  });
  res = await req(`/panel/eventos/${conCupo.id}`);
  html = await res.text();
  check(
    "no avisa si el cupo alcanza",
    // El status entra en la condición a propósito: una afirmación negativa
    // sobre el HTML pasa sola si la página devolvió un error, porque la
    // pantalla de error tampoco contiene el texto buscado.
    res.status === 200 && !html.includes("Se superó el cupo"),
    `status=${res.status}`,
  );
}

async function cleanup() {
  await prisma.event.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.space.deleteMany({ where: { name: { startsWith: MARKER } } });
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
