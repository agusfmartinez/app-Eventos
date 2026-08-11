/**
 * Smoke test de la Fase 3: QR, link público e imagen.
 *
 *   npm run test:invitaciones
 *
 * El foco está en la ruta pública: es la única del sistema que responde sin
 * sesión, así que lo importante no es solo que funcione sino qué NO expone.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";
import { InvitationStatus } from "../lib/generated/prisma/enums";
import { whatsappLink } from "../lib/invitation-url";
import { generateInvitationToken, generateShortCode } from "../lib/tokens";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const MARKER = `SMOKEINV-${Date.now()}`;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") =>
  results.push({ name, pass, detail });

// Sin cookies: así consume un invitado real.
const get = (path: string) =>
  fetch(BASE + path, { redirect: "manual", headers: {} });

async function run() {
  const event = await prisma.event.create({
    data: {
      name: `${MARKER} Casamiento`,
      eventDate: new Date("2026-12-31T00:00:00.000Z"),
      startTime: "21:00",
      endTime: "05:00",
      location: "Salón principal",
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  const guest = await prisma.guest.create({
    data: {
      eventId: event.id,
      firstName: "Juan",
      lastName: `Perez${MARKER}`,
      phone: "1122334455",
      email: `secreto-${MARKER}@ejemplo.com`,
      notes: `NOTA-INTERNA-${MARKER}`,
    },
    select: { id: true },
  });

  const token = generateInvitationToken();
  const invitation = await prisma.invitation.create({
    data: {
      guestId: guest.id,
      eventId: event.id,
      token,
      shortCode: generateShortCode(),
      maxPeople: 2,
      status: InvitationStatus.ENABLED,
    },
    select: { id: true, shortCode: true },
  });

  // --- 1. la invitación se ve sin login ---
  let res = await get(`/i/${token}`);
  let html = await res.text();
  check(
    "la invitación se ve sin iniciar sesión",
    res.status === 200 &&
      html.includes(`Perez${MARKER}`) &&
      html.includes(invitation.shortCode),
    `status=${res.status}`,
  );

  // --- 2. no filtra datos privados ---
  check(
    "no expone email, teléfono ni notas internas",
    !html.includes(`secreto-${MARKER}`) &&
      !html.includes(`NOTA-INTERNA-${MARKER}`) &&
      !html.includes("1122334455"),
  );

  // --- 3. no se indexa ---
  check(
    "pide a los buscadores no indexarla",
    html.includes("noindex"),
    "falta el meta robots noindex",
  );

  // --- 4. el QR se renderiza y apunta a la propia invitación ---
  check(
    "incluye un QR embebido",
    html.includes("<svg") && html.includes(token),
  );

  // --- 5. la imagen se genera ---
  res = await get(`/i/${token}/imagen`);
  const contentType = res.headers.get("content-type") ?? "";
  const bytes = (await res.arrayBuffer()).byteLength;
  check(
    "la imagen se genera como PNG",
    res.status === 200 && contentType.includes("image/png") && bytes > 5000,
    `status=${res.status} type=${contentType} bytes=${bytes}`,
  );

  // --- 6. un token inexistente no revela nada ---
  res = await get(`/i/${generateInvitationToken()}`);
  html = await res.text();
  check(
    "un token inexistente muestra el mensaje genérico",
    html.includes("no es válido") || html.includes("no disponible"),
  );

  // --- 7. bloquear corta el link público ---
  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { status: InvitationStatus.BLOCKED, revokedAt: new Date() },
    select: { id: true },
  });

  res = await get(`/i/${token}`);
  html = await res.text();
  check(
    "bloquear la invitación invalida el link público",
    !html.includes(`Perez${MARKER}`) && html.includes("no disponible"),
  );

  res = await get(`/i/${token}/imagen`);
  check(
    "bloquear la invitación invalida también la imagen",
    res.status === 404,
    `status=${res.status}`,
  );

  // --- 8. rehabilitar lo restaura ---
  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { status: InvitationStatus.ENABLED, revokedAt: null },
    select: { id: true },
  });
  res = await get(`/i/${token}`);
  html = await res.text();
  check("rehabilitarla restaura el link", html.includes(`Perez${MARKER}`));

  // --- 9. regenerar el token invalida el anterior ---
  const newToken = generateInvitationToken();
  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { token: newToken, shortCode: generateShortCode() },
    select: { id: true },
  });

  res = await get(`/i/${token}`);
  html = await res.text();
  const oldDead = !html.includes(`Perez${MARKER}`);

  res = await get(`/i/${newToken}`);
  html = await res.text();
  const newAlive = html.includes(`Perez${MARKER}`);

  check(
    "regenerar mata el link viejo y activa el nuevo",
    oldDead && newAlive,
    `oldDead=${oldDead} newAlive=${newAlive}`,
  );

  // --- 10. evento cancelado corta la invitación ---
  await prisma.event.update({
    where: { id: event.id },
    data: { status: "CANCELLED" },
    select: { id: true },
  });
  res = await get(`/i/${newToken}`);
  html = await res.text();
  check(
    "un evento cancelado corta la invitación",
    html.includes("cancelado"),
  );

  // --- 11. el mensaje de WhatsApp lleva el link y no datos privados ---
  const wa = whatsappLink({
    phone: "1122334455",
    guestName: "Juan Perez",
    eventName: "Casamiento",
    dateLabel: "31 de diciembre de 2026",
    timeLabel: "21:00",
    location: "Salón principal",
    maxPeople: 2,
    token: newToken,
  });
  check(
    "el link de WhatsApp incluye el link de la invitación",
    wa.startsWith("https://wa.me/1122334455?text=") &&
      decodeURIComponent(wa).includes(`/i/${newToken}`),
  );
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
