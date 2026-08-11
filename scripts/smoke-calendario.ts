/**
 * Smoke test del calendario de disponibilidad.
 *
 *   npm run test:calendario   (requiere el server corriendo)
 *
 * Lo que más importa verificar es la aritmética de fechas: las grillas de
 * calendario se rompen en los bordes de mes y en los eventos que cruzan la
 * medianoche, y esos errores son difíciles de ver a ojo.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import {
  addDays,
  addMonths,
  buildMonthGrid,
  dayLabel,
  monthLabel,
  parseDayKey,
  parseMonthKey,
  toDayKey,
  toMonthKey,
} from "../lib/calendar";
import { PrismaClient } from "../lib/generated/prisma/client";
import {
  clipToWindow,
  getOccupancy,
  overlaps,
  venueDayWindow,
} from "../lib/schedule";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const MARKER = `SMOKECAL-${Date.now()}`;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") =>
  results.push({ name, pass, detail });

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function run() {
  // ======================================================
  // 1. Grilla del mes
  // ======================================================

  // Noviembre 2026 arranca un domingo: el peor caso para una grilla que
  // empieza los lunes, porque necesita seis días de relleno adelante.
  const nov = day("2026-11-01");
  const grid = buildMonthGrid(nov);

  check(
    "la grilla del mes son semanas completas de 7 días",
    grid.every((week) => week.length === 7),
    `semanas=${grid.length}`,
  );

  check(
    "la grilla arranca un lunes",
    grid[0][0].date.getUTCDay() === 1,
    `primer día=${toDayKey(grid[0][0].date)} (getUTCDay=${grid[0][0].date.getUTCDay()})`,
  );

  const flat = grid.flat();
  check(
    "contiene todos los días del mes",
    flat.filter((c) => c.inMonth).length === 30,
    `días del mes=${flat.filter((c) => c.inMonth).length}`,
  );

  check(
    "los días de relleno quedan marcados como fuera del mes",
    flat.some((c) => !c.inMonth) &&
      flat.filter((c) => !c.inMonth).every((c) => c.date.getUTCMonth() !== 10),
  );

  check(
    "los días son consecutivos, sin saltos ni repetidos",
    flat.every((cell, i) =>
      i === 0 ? true : toDayKey(addDays(flat[i - 1].date, 1)) === cell.key,
    ),
  );

  // Febrero de un año bisiesto: el otro borde clásico.
  const feb = day("2028-02-01");
  check(
    "febrero de año bisiesto tiene sus 29 días",
    buildMonthGrid(feb).flat().filter((c) => c.inMonth).length === 29,
  );

  // ======================================================
  // 2. Navegación entre meses y días
  // ======================================================

  check(
    "avanzar de diciembre pasa a enero del año siguiente",
    toMonthKey(addMonths(day("2026-12-01"), 1)) === "2027-01",
    toMonthKey(addMonths(day("2026-12-01"), 1)),
  );
  check(
    "retroceder de enero vuelve a diciembre del año anterior",
    toMonthKey(addMonths(day("2027-01-01"), -1)) === "2026-12",
  );
  check(
    "avanzar un día cruza el fin de mes",
    toDayKey(addDays(day("2026-11-30"), 1)) === "2026-12-01",
  );
  check(
    "un parámetro de mes inválido cae en el mes por defecto",
    toMonthKey(parseMonthKey("basura", day("2026-11-15"))) === "2026-11",
  );
  check(
    "un parámetro de día inválido cae en el día por defecto",
    toDayKey(parseDayKey(undefined, day("2026-11-15"))) === "2026-11-15",
  );

  // ======================================================
  // 3. Etiquetas en español
  // ======================================================
  check(
    "el mes se muestra en español",
    monthLabel(nov) === "noviembre de 2026",
    monthLabel(nov),
  );
  check(
    "el día se muestra completo y sin correrse de fecha",
    dayLabel(day("2026-11-15")) === "15 de noviembre de 2026",
    dayLabel(day("2026-11-15")),
  );

  // ======================================================
  // 4. Ocupación real contra la base
  // ======================================================

  const salon = await prisma.space.create({
    data: { name: `${MARKER} Salón`, capacity: 120 },
    select: { id: true },
  });

  await prisma.event.create({
    data: {
      name: `${MARKER} Casamiento`,
      eventDate: day("2026-11-15"),
      startTime: "21:00",
      endTime: "05:00",
      spaceId: salon.id,
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  const occupancy = await getOccupancy({
    fromDate: day("2026-11-01"),
    toDate: day("2026-11-30"),
    spaceId: salon.id,
  });
  check(
    "el evento aparece en la ocupación del mes",
    occupancy.length === 1 && occupancy[0].name === `${MARKER} Casamiento`,
    `eventos=${occupancy.length}`,
  );

  const target = occupancy[0];

  // La ventana del salón arranca a las 08:00: la fiesta del 15 tiene que
  // entrar entera en la vista del 15, no partida entre el 15 y el 16.
  const dia15 = venueDayWindow(day("2026-11-15"));
  const box15 = clipToWindow(target.interval, dia15);
  check(
    "la fiesta que termina de madrugada entra completa en la vista de su día",
    box15 !== null && !box15.clippedStart && !box15.clippedEnd,
    JSON.stringify(box15),
  );

  const dia16 = venueDayWindow(day("2026-11-16"));
  check(
    "y no reaparece en la vista del día siguiente",
    !overlaps(target.interval, dia16),
  );

  const dia14 = venueDayWindow(day("2026-11-14"));
  check(
    "tampoco aparece en la vista del día anterior",
    !overlaps(target.interval, dia14),
  );

  // Un evento diurno que sí desborda la ventana.
  await prisma.event.create({
    data: {
      name: `${MARKER} Maraton`,
      eventDate: day("2026-11-20"),
      startTime: "06:00",
      endTime: "23:00",
      spaceId: salon.id,
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  const maraton = (
    await getOccupancy({
      fromDate: day("2026-11-20"),
      toDate: day("2026-11-20"),
      spaceId: salon.id,
    })
  ).find((e) => e.name === `${MARKER} Maraton`)!;

  const box20 = clipToWindow(maraton.interval, venueDayWindow(day("2026-11-20")));
  check(
    "un evento que arranca antes de las 08:00 se marca como recortado",
    box20 !== null && box20.clippedStart,
    JSON.stringify(box20),
  );

  // Los cancelados no ocupan.
  await prisma.event.updateMany({
    where: { name: `${MARKER} Maraton` },
    data: { status: "CANCELLED" },
  });
  const sinCancelado = await getOccupancy({
    fromDate: day("2026-11-20"),
    toDate: day("2026-11-20"),
    spaceId: salon.id,
  });
  check(
    "un evento cancelado no figura en la ocupación",
    !sinCancelado.some((e) => e.name === `${MARKER} Maraton`),
  );

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

  let res = await req("/panel/calendario?mes=2026-11");
  let html = await res.text();
  check(
    "la vista de mes muestra el evento",
    res.status === 200 && html.includes(`${MARKER} Casamiento`),
    `status=${res.status}`,
  );
  check(
    "la vista de mes marca que el evento sigue al día siguiente",
    html.includes("→"),
    "falta el indicador de cruce de medianoche",
  );

  res = await req("/panel/calendario?vista=dia&dia=2026-11-15");
  html = await res.text();
  check(
    "la vista de día muestra el evento y la columna del espacio",
    res.status === 200 &&
      html.includes(`${MARKER} Casamiento`) &&
      html.includes(`${MARKER} Salón`),
    `status=${res.status}`,
  );

  res = await req("/panel/calendario?vista=dia&dia=2026-11-17");
  html = await res.text();
  check(
    "un día libre no muestra el evento",
    res.status === 200 && !html.includes(`${MARKER} Casamiento`),
    `status=${res.status}`,
  );

  // Filtrar por otro espacio tiene que ocultarlo.
  const otro = await prisma.space.create({
    data: { name: `${MARKER} Otro` },
    select: { id: true },
  });
  res = await req(`/panel/calendario?mes=2026-11&espacio=${otro.id}`);
  html = await res.text();
  check(
    "el filtro por espacio oculta los eventos de otros espacios",
    res.status === 200 && !html.includes(`${MARKER} Casamiento`),
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
