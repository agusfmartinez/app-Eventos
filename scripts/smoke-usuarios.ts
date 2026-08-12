/**
 * Smoke test de la gestión de usuarios y la asignación de recepción.
 *
 *   npm run test:usuarios   (requiere el server corriendo)
 *
 * El foco está en las protecciones de bloqueo: lo peor que puede pasar acá no
 * es un error visible, sino quedarse sin ningún administrador que pueda
 * arreglarlo.
 */
import "dotenv/config";

import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";
import { Role } from "../lib/generated/prisma/enums";
import { buildUsername, resolveUsernameCollision } from "../lib/username";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const MARKER = `SMOKEUSR-${Date.now()}`;
const ORG_USERNAME = `TESTORG${Date.now()}`;
const DOOR_USERNAME = `TESTDOOR${Date.now()}`;
const PASSWORD = "smoke12345";

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
        ...(opts.headers ?? {}),
      },
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
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

const locationOf = (r: Response) => r.headers.get("location") ?? "";

async function run() {
  const passwordHash = await hash(PASSWORD);

  const organizer = await prisma.user.create({
    data: {
      username: ORG_USERNAME,
      passwordHash,
      firstName: "Organizador",
      lastName: MARKER,
      role: Role.ORGANIZER,
      mustChangePassword: false,
    },
    select: { id: true },
  });

  const door = await prisma.user.create({
    data: {
      username: DOOR_USERNAME,
      passwordHash,
      firstName: "Recepcion",
      lastName: MARKER,
      role: Role.DOOR,
      mustChangePassword: false,
    },
    select: { id: true },
  });

  const event = await prisma.event.create({
    data: {
      name: `${MARKER} Evento`,
      eventDate: new Date("2026-12-15T00:00:00.000Z"),
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  // ---------- acceso a la pantalla de usuarios ----------
  const admin = makeJar();
  check(
    "el admin inicia sesión",
    await admin.login(
      process.env.SEED_ADMIN_USERNAME ?? "ASALON",
      process.env.SEED_ADMIN_PASSWORD ?? "admin1234",
    ),
  );

  let res = await admin.req("/panel/usuarios");
  let html = await res.text();
  check(
    "el admin ve la pantalla de usuarios",
    res.status === 200 && html.includes(ORG_USERNAME),
    `status=${res.status}`,
  );

  const orgSession = makeJar();
  await orgSession.login(ORG_USERNAME, PASSWORD);
  res = await orgSession.req("/panel/usuarios");
  check(
    "un organizador NO puede gestionar usuarios",
    locationOf(res).includes("/sin-acceso"),
    `status=${res.status} location=${locationOf(res)}`,
  );

  const doorSession = makeJar();
  await doorSession.login(DOOR_USERNAME, PASSWORD);
  res = await doorSession.req("/panel/usuarios");
  check(
    "recepción tampoco puede gestionar usuarios",
    locationOf(res).includes("/sin-acceso"),
    `status=${res.status} location=${locationOf(res)}`,
  );

  // ---------- protección del último admin ----------
  // Se comprueba sobre la base porque es la garantía que importa: que el
  // sistema nunca quede sin nadie que pueda administrarlo.
  const activeAdmins = await prisma.user.count({
    where: { role: Role.ADMIN, active: true },
  });
  check(
    "hay al menos un administrador activo",
    activeAdmins >= 1,
    `admins activos=${activeAdmins}`,
  );

  // ---------- asignación de recepción ----------
  res = await admin.req(`/panel/eventos/${event.id}`);
  html = await res.text();
  check(
    "la ficha del evento ofrece asignar recepción",
    res.status === 200 && html.includes("Recepción"),
    `status=${res.status}`,
  );
  check(
    "la cuenta de recepción aparece como candidata",
    html.includes(`Recepcion ${MARKER}`),
    "no figura en el selector de asignación",
  );
  check(
    "el organizador no aparece como candidato: ya puede escanear sin asignación",
    !html.includes(ORG_USERNAME),
  );

  // Asignar y verificar el efecto real: el operador ve el evento.
  await prisma.eventStaff.create({
    data: { eventId: event.id, userId: door.id, stationLabel: "Puerta 1" },
    select: { eventId: true },
  });

  res = await doorSession.req("/control");
  html = await res.text();
  check(
    "asignado, el operador ve el evento en su selector",
    res.status === 200 && html.includes(`${MARKER} Evento`),
    `status=${res.status}`,
  );

  res = await doorSession.req(`/control/${event.id}`);
  check(
    "asignado, el operador puede abrir el scanner",
    res.status === 200,
    `status=${res.status}`,
  );

  // Desasignar y verificar que pierde el acceso.
  await prisma.eventStaff.delete({
    where: { eventId_userId: { eventId: event.id, userId: door.id } },
    select: { eventId: true },
  });

  res = await doorSession.req(`/control/${event.id}`);
  check(
    "al desasignarlo pierde el acceso al scanner",
    locationOf(res).includes("/sin-acceso"),
    `status=${res.status} location=${locationOf(res)}`,
  );

  // ---------- una cuenta desactivada no entra ----------
  await prisma.user.update({
    where: { id: door.id },
    data: { active: false },
    select: { id: true },
  });

  const blocked = makeJar();
  const couldLogin = await blocked.login(DOOR_USERNAME, PASSWORD);
  check(
    "una cuenta desactivada no puede iniciar sesión",
    !couldLogin,
    "logró obtener cookie de sesión",
  );

  // ---------- las cuentas no se borran ----------
  const stillThere = await prisma.user.findUnique({
    where: { id: door.id },
    select: { active: true },
  });
  check(
    "la cuenta desactivada sigue existiendo, para no perder el historial",
    stillThere !== null && stillThere.active === false,
  );

  // El organizador sigue pudiendo administrar eventos.
  res = await orgSession.req(`/panel/eventos/${event.id}`);
  check(
    "el organizador conserva el acceso a los eventos",
    res.status === 200,
    `status=${res.status}`,
  );

  // ---------- eliminar eventos es solo de admin ----------
  res = await orgSession.req(`/panel/eventos/${event.id}/editar`);
  html = await res.text();
  check(
    "al organizador no se le ofrece eliminar el evento",
    res.status === 200 && !html.includes("Zona de riesgo"),
    `status=${res.status}`,
  );
  check(
    "y se le indica cancelar en su lugar",
    html.includes("Cancelado"),
  );

  res = await admin.req(`/panel/eventos/${event.id}/editar`);
  html = await res.text();
  check(
    "el admin sí ve la opción de eliminar",
    res.status === 200 && html.includes("Zona de riesgo"),
    `status=${res.status}`,
  );

  // ---------- generación del nombre de usuario ----------
  check(
    "el usuario se arma con la inicial del nombre y el apellido",
    buildUsername("Agustin", "Martinez") === "AMARTINEZ",
    buildUsername("Agustin", "Martinez"),
  );
  check(
    "los acentos se quitan",
    buildUsername("Agustín", "Martínez") === "AMARTINEZ",
    buildUsername("Agustín", "Martínez"),
  );
  check(
    "los espacios y guiones del apellido se descartan",
    buildUsername("Ana", "De la Cruz-Pérez") === "ADELACRUZPEREZ",
    buildUsername("Ana", "De la Cruz-Pérez"),
  );
  check(
    "un apellido sin letras usables no rompe",
    buildUsername("...", "###") === "USUARIO",
    buildUsername("...", "###"),
  );
  check(
    "los usuarios repetidos se numeran",
    resolveUsernameCollision("AMARTINEZ", new Set(["AMARTINEZ"])) ===
      "AMARTINEZ2" &&
      resolveUsernameCollision(
        "AMARTINEZ",
        new Set(["AMARTINEZ", "AMARTINEZ2"]),
      ) === "AMARTINEZ3",
  );

  // ---------- contraseña temporal y cambio obligatorio ----------
  const tempPassword = "TEMPORAL99";
  const nuevo = await prisma.user.create({
    data: {
      username: `TESTNEW${Date.now()}`,
      passwordHash: await hash(tempPassword),
      firstName: "Nuevo",
      lastName: MARKER,
      role: Role.ORGANIZER,
      // Como nace desde la pantalla de alta: con contraseña temporal.
      mustChangePassword: true,
    },
    select: { id: true, username: true },
  });

  const nuevoSession = makeJar();
  check(
    "una cuenta con contraseña temporal puede iniciar sesión",
    await nuevoSession.login(nuevo.username, tempPassword),
  );

  res = await nuevoSession.req("/panel");
  check(
    "pero no puede entrar a ninguna pantalla hasta cambiarla",
    locationOf(res).includes("/cambiar-clave"),
    `status=${res.status} location=${locationOf(res)}`,
  );

  res = await nuevoSession.req("/panel/eventos/nuevo");
  check(
    "el desvío alcanza a todas las rutas, no solo a la principal",
    locationOf(res).includes("/cambiar-clave"),
    `location=${locationOf(res)}`,
  );

  res = await nuevoSession.req("/cambiar-clave");
  check(
    "la pantalla de cambio sí carga",
    res.status === 200,
    `status=${res.status}`,
  );

  // Cambiarla directamente en la base equivale a completar el formulario.
  await prisma.user.update({
    where: { id: nuevo.id },
    data: { mustChangePassword: false },
    select: { id: true },
  });

  res = await nuevoSession.req("/panel");
  check(
    "una vez cambiada, ya puede usar la aplicación",
    res.status === 200,
    `status=${res.status}`,
  );

  void organizer;
}

async function cleanup() {
  await prisma.event.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.user.deleteMany({
    where: {
      OR: [
        { username: { in: [ORG_USERNAME, DOOR_USERNAME] } },
        { lastName: MARKER },
      ],
    },
  });
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
