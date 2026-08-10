/**
 * Test de concurrencia del check-in — el más importante del proyecto.
 *
 *   npm run test:concurrencia
 *
 * No necesita el server corriendo: ejercita `confirmCheckIn` directamente
 * contra Postgres, que es donde vive la garantía.
 *
 * La regla que se verifica es una sola: por más operadores que escaneen el
 * mismo QR al mismo tiempo, NUNCA pueden entrar más personas de las
 * autorizadas.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { confirmCheckIn, lookupInvitation, extractToken } from "../lib/checkin";
import { PrismaClient } from "../lib/generated/prisma/client";
import { InvitationStatus } from "../lib/generated/prisma/enums";
import { generateInvitationToken, generateShortCode } from "../lib/tokens";

const MARKER = `SMOKECONC-${Date.now()}`;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") =>
  results.push({ name, pass, detail });

let operatorId = "";
let eventId = "";
let otherEventId = "";

async function makeInvitation(
  maxPeople: number,
  status: InvitationStatus = InvitationStatus.ENABLED,
) {
  const guest = await prisma.guest.create({
    data: {
      eventId,
      firstName: "Invitado",
      lastName: `${MARKER}-${Math.random().toString(36).slice(2, 7)}`,
    },
    select: { id: true },
  });

  return prisma.invitation.create({
    data: {
      guestId: guest.id,
      eventId,
      token: generateInvitationToken(),
      shortCode: generateShortCode(),
      maxPeople,
      status,
    },
    select: { id: true, token: true, maxPeople: true },
  });
}

/** Estado real en la base, que es la única fuente que importa. */
async function actualState(invitationId: string) {
  const [invitation, ledger] = await Promise.all([
    prisma.invitation.findUniqueOrThrow({
      where: { id: invitationId },
      select: { enteredCount: true, maxPeople: true },
    }),
    prisma.checkIn.aggregate({
      where: { invitationId },
      _sum: { peopleCount: true },
    }),
  ]);

  return {
    enteredCount: invitation.enteredCount,
    maxPeople: invitation.maxPeople,
    ledgerTotal: ledger._sum.peopleCount ?? 0,
  };
}

const scan = (token: string, people: number, station: string) =>
  confirmCheckIn({
    code: token,
    eventId,
    people,
    operatorId,
    stationLabel: station,
  });

async function run() {
  const admin = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  operatorId = admin.id;

  const event = await prisma.event.create({
    data: {
      name: `${MARKER} Fiesta`,
      eventDate: new Date("2026-12-31T00:00:00.000Z"),
      status: "PUBLISHED",
    },
    select: { id: true },
  });
  eventId = event.id;

  const other = await prisma.event.create({
    data: {
      name: `${MARKER} Otra fiesta`,
      eventDate: new Date("2026-12-30T00:00:00.000Z"),
      status: "PUBLISHED",
    },
    select: { id: true },
  });
  otherEventId = other.id;

  // ======================================================
  // 1. EL CASO DEL BRIEF: dos operadores, misma invitación
  // ======================================================
  {
    const inv = await makeInvitation(2);

    // Dos escaneos SIMULTÁNEOS pidiendo 2 personas cada uno.
    // Sin lock: 0/2 leído por ambos → 4/2. Con lock: uno pasa, el otro no.
    const [a, b] = await Promise.all([
      scan(inv.token, 2, "Puerta 1"),
      scan(inv.token, 2, "Puerta 2"),
    ]);

    const oks = [a, b].filter((r) => r.result === "OK").length;
    const state = await actualState(inv.id);

    check(
      "dos operadores piden 2 sobre un cupo de 2: solo uno registra",
      oks === 1,
      `resultados=${a.result},${b.result}`,
    );
    check(
      "el contador queda en 2 de 2, nunca en 4",
      state.enteredCount === 2,
      `enteredCount=${state.enteredCount}`,
    );
    check(
      "el libro de ingresos coincide con el contador",
      state.ledgerTotal === state.enteredCount,
      `ledger=${state.ledgerTotal} contador=${state.enteredCount}`,
    );
  }

  // ======================================================
  // 2. Estampida: 20 escaneos simultáneos de a 1 sobre cupo 3
  // ======================================================
  {
    const inv = await makeInvitation(3);

    const attempts = await Promise.all(
      Array.from({ length: 20 }, (_, i) => scan(inv.token, 1, `Puesto ${i}`)),
    );

    const oks = attempts.filter((r) => r.result === "OK").length;
    const exhausted = attempts.filter((r) => r.result === "EXHAUSTED").length;
    const state = await actualState(inv.id);

    check(
      "20 escaneos simultáneos sobre cupo 3: exactamente 3 registran",
      oks === 3,
      `ok=${oks} exhausted=${exhausted}`,
    );
    check(
      "nunca se supera el cupo bajo estampida",
      state.enteredCount === 3 && state.ledgerTotal === 3,
      `enteredCount=${state.enteredCount} ledger=${state.ledgerTotal}`,
    );
    check(
      "los rechazados dicen que la invitación está agotada",
      oks + exhausted === 20,
      `ok=${oks} exhausted=${exhausted} total=20`,
    );
  }

  // ======================================================
  // 3. Grupos desparejos: 5 simultáneos de a 2 sobre cupo 5
  // ======================================================
  {
    const inv = await makeInvitation(5);

    const attempts = await Promise.all(
      Array.from({ length: 5 }, () => scan(inv.token, 2, "Puerta")),
    );

    const oks = attempts.filter((r) => r.result === "OK").length;
    const state = await actualState(inv.id);

    // Entran de a 2: pasan dos escaneos (4) y el quinto lugar queda libre
    // porque nadie puede entrar de a 2 con 1 solo disponible.
    check(
      "pedidos de a 2 sobre cupo 5: entran 4 y sobra 1 lugar",
      oks === 2 && state.enteredCount === 4,
      `ok=${oks} enteredCount=${state.enteredCount}`,
    );
    check(
      "el sobrante se puede usar con un pedido de 1",
      (await scan(inv.token, 1, "Puerta")).result === "OK",
    );

    const finalState = await actualState(inv.id);
    check(
      "cerrado exacto en 5 de 5",
      finalState.enteredCount === 5 && finalState.ledgerTotal === 5,
      `enteredCount=${finalState.enteredCount}`,
    );
  }

  // ======================================================
  // 4. Casos de rechazo del brief
  // ======================================================
  {
    const blocked = await makeInvitation(2, InvitationStatus.BLOCKED);
    check(
      "invitación bloqueada: acceso denegado",
      (await scan(blocked.token, 1, "Puerta")).result === "BLOCKED",
    );

    const pending = await makeInvitation(2, InvitationStatus.PENDING);
    check(
      "invitación sin confirmar: requiere atención",
      (await scan(pending.token, 1, "Puerta")).result === "PENDING",
    );

    check(
      "token inexistente: QR inválido",
      (await scan(generateInvitationToken(), 1, "Puerta")).result === "NOT_FOUND",
    );

    const wrong = await makeInvitation(2);
    const wrongResult = await confirmCheckIn({
      code: wrong.token,
      eventId: otherEventId, // se escanea en el evento equivocado
      people: 1,
      operatorId,
      stationLabel: null,
    });
    check(
      "invitación de otro evento: se rechaza y dice de cuál",
      wrongResult.result === "WRONG_EVENT",
      `resultado=${wrongResult.result}`,
    );

    const stateAfter = await actualState(wrong.id);
    check(
      "un rechazo no registra ningún ingreso",
      stateAfter.enteredCount === 0 && stateAfter.ledgerTotal === 0,
    );

    const tooMany = await makeInvitation(2);
    check(
      "pedir más personas de las permitidas se rechaza",
      (await scan(tooMany.token, 3, "Puerta")).result === "TOO_MANY",
    );
  }

  // ======================================================
  // 5. La consulta previa no modifica nada
  // ======================================================
  {
    const inv = await makeInvitation(4);
    await lookupInvitation(inv.token, eventId);
    await lookupInvitation(inv.token, eventId);
    const state = await actualState(inv.id);

    check(
      "consultar el QR no registra ingresos",
      state.enteredCount === 0 && state.ledgerTotal === 0,
      `enteredCount=${state.enteredCount}`,
    );
  }

  // ======================================================
  // 6. El QR trae una URL, no el token pelado
  // ======================================================
  {
    const inv = await makeInvitation(1);
    const scannedText = `https://salon.example.com/i/${inv.token}`;

    check(
      "extrae el token de la URL que codifica el QR",
      extractToken(scannedText) === inv.token,
    );

    const result = await scan(extractToken(scannedText), 1, "Puerta");
    check("un QR real registra el ingreso", result.result === "OK");
  }

  // ======================================================
  // 7. Última red: el CHECK de la base
  // ======================================================
  {
    const inv = await makeInvitation(2);
    let rejected = false;
    try {
      // Simula código futuro que escribe el contador salteándose confirmCheckIn.
      await prisma.invitation.update({
        where: { id: inv.id },
        data: { enteredCount: 5 },
        select: { id: true },
      });
    } catch {
      rejected = true;
    }
    check(
      "escribir el contador por fuera de la transacción lo rechaza Postgres",
      rejected,
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
