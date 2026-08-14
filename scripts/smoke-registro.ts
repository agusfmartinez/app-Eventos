/**
 * Smoke test del formulario público de registro.
 *
 *   npm run test:registro   (requiere el server corriendo)
 *
 * Lo que importa acá es que los límites aguanten: el link es un portador y
 * circula por WhatsApp, así que el cupo, la fecha y el cierre son lo único que
 * separa "se anotaron los invitados" de "se anotó medio barrio".
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";
import { InvitationStatus } from "../lib/generated/prisma/enums";
import {
  findTicket,
  getRegistrationForm,
  registerGuest,
} from "../lib/registration";
import { generateInvitationToken } from "../lib/tokens";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const MARKER = `SMOKEREG-${Date.now()}`;
const DNI = () => String(Math.floor(10_000_000 + Math.random() * 80_000_000));

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") =>
  results.push({ name, pass, detail });

function dateOnly(daysFromToday: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d;
}

async function makeEvent(
  name: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; token: string }> {
  const token = generateInvitationToken();

  const event = await prisma.event.create({
    data: {
      name: `${MARKER} ${name}`,
      eventDate: dateOnly(7),
      startTime: "21:00",
      endTime: "05:00",
      status: "PUBLISHED",
      registrationToken: token,
      registrationOpen: true,
      registrationMaxPeople: 4,
      ...overrides,
    },
    select: { id: true },
  });

  return { id: event.id, token };
}

async function run() {
  // ---------- el formulario se abre y muestra el evento ----------

  const abierto = await makeEvent("Abierto", { maxGuests: 10 });

  const form = await getRegistrationForm(abierto.token);
  check(
    "el formulario abierto devuelve los datos del evento",
    form.open && form.form.eventName === `${MARKER} Abierto`,
    JSON.stringify(form).slice(0, 120),
  );
  check(
    "informa cuántos lugares quedan",
    form.open && form.form.remaining === 10,
    form.open ? String(form.form.remaining) : "cerrado",
  );

  const sinCupo = await makeEvent("Sin cupo");
  const sinCupoForm = await getRegistrationForm(sinCupo.token);
  check(
    "sin cupo definido, el formulario no informa lugares",
    sinCupoForm.open && sinCupoForm.form.remaining === null,
    sinCupoForm.open ? String(sinCupoForm.form.remaining) : "cerrado",
  );

  check(
    "un token inexistente no dice nada del sistema",
    !(await getRegistrationForm("no-existe")).open,
  );

  // ---------- alta ----------

  const dniAna = DNI();
  const alta = await registerGuest(abierto.token, {
    firstName: "Ana",
    lastName: "Gómez",
    document: dniAna,
    phone: "1122334455",
    people: 2,
  });

  check("una persona se registra y recibe su token", alta.ok && Boolean(alta.token));

  const creada = alta.ok
    ? await prisma.invitation.findUnique({
        where: { token: alta.token },
        select: {
          status: true,
          maxPeople: true,
          guest: { select: { viaRegistration: true, document: true } },
        },
      })
    : null;

  check(
    "con auto-aprobación la invitación nace habilitada",
    creada?.status === InvitationStatus.ENABLED,
    creada?.status ?? "sin invitación",
  );
  check(
    "queda marcada como registro público y con su DNI",
    creada?.guest.viaRegistration === true && creada?.guest.document === dniAna,
  );
  check("respeta la cantidad de personas pedida", creada?.maxPeople === 2);

  // ---------- duplicados ----------

  const repetido = await registerGuest(abierto.token, {
    firstName: "Ana",
    lastName: "Gomez", // sin tilde: la misma persona escribiendo apurada
    document: dniAna,
    phone: null,
    people: 1,
  });

  check(
    "si vuelve a anotarse con el mismo DNI recupera su entrada",
    repetido.ok && "existing" in repetido && repetido.token === (alta.ok ? alta.token : ""),
    JSON.stringify(repetido).slice(0, 120),
  );

  const ajeno = await registerGuest(abierto.token, {
    firstName: "Otro",
    lastName: "Distinto",
    document: dniAna,
    phone: null,
    people: 1,
  });

  check(
    "un DNI ajeno con otro apellido no devuelve la entrada de nadie",
    !ajeno.ok && ajeno.reason === "DUPLICATE",
    ajeno.ok ? "devolvió una entrada" : ajeno.reason,
  );

  // ---------- topes ----------

  const excedido = await registerGuest(abierto.token, {
    firstName: "Grupo",
    lastName: "Grande",
    document: DNI(),
    phone: null,
    people: 9, // el tope del evento es 4
  });

  check(
    "no se puede pasar el tope de personas por registro",
    !excedido.ok && excedido.reason === "TOO_MANY",
    excedido.ok ? "lo dejó pasar" : excedido.reason,
  );

  // ---------- cupo, con dos registros en paralelo ----------

  const justo = await makeEvent("Cupo justo", { maxGuests: 2 });

  const [a, b] = await Promise.all([
    registerGuest(justo.token, {
      firstName: "Primero",
      lastName: "Uno",
      document: DNI(),
      phone: null,
      people: 2,
    }),
    registerGuest(justo.token, {
      firstName: "Segundo",
      lastName: "Dos",
      document: DNI(),
      phone: null,
      people: 2,
    }),
  ]);

  const aceptados = [a, b].filter((r) => r.ok).length;
  check(
    "con cupo para 2, dos registros simultáneos de 2 dejan entrar solo a uno",
    aceptados === 1,
    `aceptados=${aceptados}`,
  );

  // El cupo cuenta personas, no registros: una familia de dos ocupa dos
  // lugares. Es justo la distinción por la que se descartó un tope aparte.
  const ocupado = await prisma.invitation.aggregate({
    where: { eventId: justo.id },
    _sum: { maxPeople: true },
  });
  check(
    "el cupo se descuenta por personas, no por registros",
    ocupado._sum.maxPeople === 2,
    `personas=${ocupado._sum.maxPeople}`,
  );

  const lleno = await getRegistrationForm(justo.token);
  check(
    "con el cupo agotado el formulario se cierra solo",
    !lleno.open && lleno.reason === "FULL",
    lleno.open ? "sigue abierto" : lleno.reason,
  );

  // ---------- cierre manual y vencimiento ----------

  const cerrado = await makeEvent("Cerrado", { registrationOpen: false });
  const cerradoForm = await getRegistrationForm(cerrado.token);
  check(
    "un formulario cerrado no acepta registros",
    !cerradoForm.open && cerradoForm.reason === "CLOSED",
  );

  const vencido = await makeEvent("Vencido", {
    registrationDeadline: dateOnly(-1),
  });
  const vencidoForm = await getRegistrationForm(vencido.token);
  check(
    "una fecha límite vencida cierra el formulario",
    !vencidoForm.open && vencidoForm.reason === "EXPIRED",
    vencidoForm.open ? "sigue abierto" : vencidoForm.reason,
  );

  const vencidoAlta = await registerGuest(vencido.token, {
    firstName: "Tarde",
    lastName: "Llegué",
    document: DNI(),
    phone: null,
    people: 1,
  });
  check(
    "y tampoco deja registrarse por la puerta de atrás",
    !vencidoAlta.ok && vencidoAlta.reason === "EXPIRED",
    vencidoAlta.ok ? "lo dejó pasar" : vencidoAlta.reason,
  );

  const borrador = await makeEvent("Borrador", { status: "DRAFT" });
  const borradorForm = await getRegistrationForm(borrador.token);
  check(
    "un evento en borrador no recibe registros",
    !borradorForm.open && borradorForm.reason === "CLOSED",
  );

  // ---------- recuperar la entrada ----------

  const encontrada = await findTicket(dniAna, "gomez");
  check(
    "se recupera la entrada con DNI y apellido, sin importar tildes",
    encontrada?.token === (alta.ok ? alta.token : ""),
    encontrada ? "ok" : "no la encontró",
  );

  check(
    "con el apellido equivocado no devuelve nada",
    (await findTicket(dniAna, "Perez")) === null,
  );

  // ---------- páginas públicas ----------

  let res = await fetch(`${BASE}/r/${abierto.token}`);
  let html = await res.text();
  check(
    "la página del formulario muestra el evento",
    res.status === 200 && html.includes(`${MARKER} Abierto`),
    `status=${res.status}`,
  );

  res = await fetch(`${BASE}/r/token-inventado`);
  html = await res.text();
  check(
    "un link inventado no filtra ningún evento",
    res.status === 200 && html.includes("no válido") && !html.includes(MARKER),
    `status=${res.status}`,
  );

  res = await fetch(`${BASE}/mi-entrada`);
  check(
    "la búsqueda de entrada está disponible sin sesión",
    res.status === 200,
    `status=${res.status}`,
  );

  if (alta.ok) {
    res = await fetch(`${BASE}/i/${alta.token}`);
    html = await res.text();
    check(
      "la entrada generada se puede abrir y descargar",
      res.status === 200 && html.includes("Descargar mi entrada"),
      `status=${res.status}`,
    );
  }
}

async function cleanup() {
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
