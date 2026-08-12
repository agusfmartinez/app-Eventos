import "dotenv/config";

import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";
import { Role } from "../lib/generated/prisma/enums";
import { buildUsername } from "../lib/username";

// Cliente propio en vez de lib/db.ts: ese módulo importa "server-only" y
// explota fuera del runtime de Next.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definida. Copiá .env.example a .env.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const firstName = (process.env.SEED_ADMIN_FIRST_NAME ?? "Admin").trim();
  const lastName = (process.env.SEED_ADMIN_LAST_NAME ?? "Salon").trim();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase() || null;

  if (!password) {
    throw new Error("Falta SEED_ADMIN_PASSWORD en el .env.");
  }
  if (password.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD tiene que tener al menos 8 caracteres.");
  }

  const username = buildUsername(firstName, lastName);
  const passwordHash = await hash(password);

  // La cuenta se identifica por username **o** por email: así, si el admin ya
  // existe con otro usuario —por ejemplo el que generó la migración a partir
  // del nombre viejo— se actualiza en lugar de crear un duplicado.
  //
  // Correr el seed dos veces no pisa la contraseña de un admin que ya existe y
  // quizá ya la cambió.
  //
  // El admin del seed nace con `mustChangePassword` en false: su contraseña
  // sale del .env, así que ya la eligió quien instaló el sistema. Las cuentas
  // creadas después desde la pantalla sí arrancan con una temporal.
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username }, ...(email ? [{ email }] : [])],
    },
    select: { id: true, username: true },
  });

  const admin = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          username,
          firstName,
          lastName,
          email,
          role: Role.ADMIN,
          active: true,
        },
        select: { username: true, firstName: true, lastName: true },
      })
    : await prisma.user.create({
        data: {
          username,
          firstName,
          lastName,
          email,
          passwordHash,
          role: Role.ADMIN,
          mustChangePassword: false,
        },
        select: { username: true, firstName: true, lastName: true },
      });

  if (existing && existing.username !== username) {
    console.log(`  (se renombró el usuario ${existing.username} → ${username})`);
  }

  console.log(
    `✔ Admin listo: ${admin.username} (${admin.firstName} ${admin.lastName})`,
  );
}

main()
  .catch((error) => {
    console.error("✕ Falló el seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
