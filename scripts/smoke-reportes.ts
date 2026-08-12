/**
 * Smoke test de la Fase 5: estadísticas, historial y exportación.
 *
 *   npm run test:reportes   (requiere el server corriendo)
 */
import "dotenv/config";

import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";

import { buildCsv } from "../lib/csv";
import { PrismaClient } from "../lib/generated/prisma/client";
import { InvitationStatus, Role } from "../lib/generated/prisma/enums";
import { generateInvitationToken, generateShortCode } from "../lib/tokens";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const MARKER = `SMOKEREP-${Date.now()}`;
const DOOR_USERNAME = `TESTREP${Date.now()}`;
const DOOR_PASSWORD = "puerta12345";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") =>
  results.push({ name, pass, detail });

function makeJar() {
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

async function run() {
  const admin = await prisma.user.findFirstOrThrow({
    where: { role: Role.ADMIN },
    select: { id: true },
  });

  const event = await prisma.event.create({
    data: {
      name: `${MARKER} Fiesta`,
      eventDate: new Date("2026-12-31T00:00:00.000Z"),
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  // Tres invitaciones que cubren los tres estados de llegada.
  async function seedGuest(
    lastName: string,
    maxPeople: number,
    enteredCount: number,
    status: InvitationStatus = InvitationStatus.ENABLED,
  ) {
    const guest = await prisma.guest.create({
      data: {
        eventId: event.id,
        firstName: "Test",
        lastName,
        phone: "1122334455",
      },
      select: { id: true },
    });

    const invitation = await prisma.invitation.create({
      data: {
        guestId: guest.id,
        eventId: event.id,
        token: generateInvitationToken(),
        shortCode: generateShortCode(),
        maxPeople,
        enteredCount,
        status,
      },
      select: { id: true },
    });

    if (enteredCount > 0) {
      await prisma.checkIn.create({
        data: {
          invitationId: invitation.id,
          guestId: guest.id,
          eventId: event.id,
          peopleCount: enteredCount,
          operatorId: admin.id,
          stationLabel: "Puerta 1",
        },
        select: { id: true },
      });
    }

    return guest.id;
  }

  await seedGuest(`Completo${MARKER}`, 2, 2); // entró todo
  await seedGuest(`Parcial${MARKER}`, 4, 1); // entró en parte
  await seedGuest(`Falta${MARKER}`, 3, 0); // no llegó
  await seedGuest(`Bloqueado${MARKER}`, 1, 0, InvitationStatus.BLOCKED);

  // Nombre hostil: si el CSV no lo neutraliza, Excel lo ejecuta como fórmula.
  const evilName = `=HYPERLINK("http://malo","click")${MARKER}`;
  await seedGuest(evilName, 1, 0);

  const session = makeJar();
  check(
    "el admin inicia sesión",
    await session.login(
      process.env.SEED_ADMIN_USERNAME ?? "ASALON",
      process.env.SEED_ADMIN_PASSWORD ?? "admin1234",
    ),
  );

  // ---------- estadísticas ----------
  let res = await session.req(`/panel/eventos/${event.id}`);
  let html = await res.text();

  check(
    "la ficha del evento carga con las estadísticas",
    res.status === 200,
    `status=${res.status}`,
  );
  check(
    "el progreso muestra las personas ingresadas sobre el cupo",
    // 2 + 1 = 3 ingresados; 2+4+3+1+1 = 11 de cupo.
    // Se verifica sobre los atributos ARIA y no sobre el texto: React separa
    // las interpolaciones con marcadores de comentario, así que en el HTML
    // "3 de 11" nunca aparece contiguo.
    html.includes('aria-valuenow="3"') && html.includes('aria-valuemax="11"'),
    "no se encontró el progressbar con 3/11",
  );
  check(
    "el ritmo de ingresos aparece",
    html.includes("Ritmo de ingresos"),
  );

  // ---------- historial ----------
  res = await session.req(`/panel/eventos/${event.id}/ingresos`);
  html = await res.text();
  check(
    "el historial lista los ingresos registrados",
    res.status === 200 &&
      html.includes(`Completo${MARKER}`) &&
      html.includes(`Parcial${MARKER}`),
    `status=${res.status}`,
  );
  check(
    "el historial no lista invitados que no ingresaron",
    !html.includes(`Falta${MARKER}`),
  );

  res = await session.req(
    `/panel/eventos/${event.id}/ingresos?q=Completo${MARKER}`,
  );
  html = await res.text();
  check(
    "la búsqueda del historial filtra",
    html.includes(`Completo${MARKER}`) && !html.includes(`Parcial${MARKER}`),
  );

  // ---------- exportación de invitados ----------
  res = await session.req(`/panel/eventos/${event.id}/export/invitados`);
  // Se leen los bytes crudos: `Response.text()` descarta el BOM por
  // especificación, así que sobre el string es imposible verificar que esté.
  const rawBytes = new Uint8Array(await res.arrayBuffer());
  const csv = new TextDecoder("utf-8").decode(rawBytes);

  check(
    "la exportación responde como CSV descargable",
    res.status === 200 &&
      (res.headers.get("content-type") ?? "").includes("text/csv") &&
      (res.headers.get("content-disposition") ?? "").includes("attachment"),
    `status=${res.status} type=${res.headers.get("content-type")}`,
  );
  check(
    "el CSV arranca con BOM para que Excel respete los acentos",
    rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf,
    `primeros bytes=${[...rawBytes.slice(0, 3)].map((b) => b.toString(16)).join(" ")}`,
  );
  check(
    "el CSV usa punto y coma como separador",
    csv.split("\r\n")[0].includes("Nombre;Apellido"),
    `cabecera=${csv.split("\r\n")[0].slice(0, 60)}`,
  );
  check(
    "el CSV incluye a todos los invitados",
    csv.includes(`Completo${MARKER}`) &&
      csv.includes(`Falta${MARKER}`) &&
      csv.includes(`Bloqueado${MARKER}`),
  );
  check(
    "el CSV trae los estados derivados",
    csv.includes("Ingresó") && csv.includes("Parcial") && csv.includes("Bloqueado"),
  );

  // La prueba que importa de esta fase.
  check(
    "una fórmula en el nombre queda neutralizada",
    csv.includes(`'=HYPERLINK`) && !csv.includes(`;=HYPERLINK`),
    "el CSV dejaría ejecutar la fórmula al abrirlo en Excel",
  );

  // ---------- exportación de ingresos ----------
  res = await session.req(`/panel/eventos/${event.id}/export/ingresos`);
  const csvIn = await res.text();
  check(
    "la exportación de ingresos trae los check-ins con operador y puesto",
    res.status === 200 &&
      csvIn.includes(`Completo${MARKER}`) &&
      csvIn.includes("Puerta 1"),
    `status=${res.status}`,
  );
  check(
    "la exportación de ingresos no incluye a quien no entró",
    !csvIn.includes(`Falta${MARKER}`),
  );

  // ---------- permisos ----------
  const door = await prisma.user.create({
    data: {
      username: DOOR_USERNAME,
      passwordHash: await hash(DOOR_PASSWORD),
      firstName: "Operador",
      lastName: MARKER,
      role: Role.DOOR,
      // Si quedara en true, el login lo mandaría a cambiar la contraseña y
      // el test no llegaría a probar nada.
      mustChangePassword: false,
    },
    select: { id: true },
  });
  await prisma.eventStaff.create({
    data: { eventId: event.id, userId: door.id },
    select: { eventId: true },
  });

  const doorSession = makeJar();
  await doorSession.login(DOOR_USERNAME, DOOR_PASSWORD);

  res = await doorSession.req(`/panel/eventos/${event.id}/export/invitados`);
  check(
    "un operador de puerta no puede descargar la lista de invitados",
    res.status === 403,
    `status=${res.status}`,
  );

  const anon = makeJar();
  res = await anon.req(`/panel/eventos/${event.id}/export/invitados`);
  check(
    "sin sesión tampoco se puede descargar",
    res.status === 403,
    `status=${res.status}`,
  );

  // ---------- escapado ----------
  const sample = buildCsv(
    ["a", "b"],
    [['tiene "comillas"', "tiene;separador"]],
  );
  check(
    "el CSV escapa comillas y separadores",
    sample.includes('"tiene ""comillas"""') && sample.includes('"tiene;separador"'),
    sample.split("\r\n")[1],
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
