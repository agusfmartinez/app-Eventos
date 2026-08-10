import "dotenv/config";

import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";
import { Role } from "../lib/generated/prisma/enums";

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
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  const fullName = process.env.SEED_ADMIN_NAME ?? "Administrador";

  if (!email || !password) {
    throw new Error(
      "Faltan SEED_ADMIN_EMAIL y/o SEED_ADMIN_PASSWORD en el .env.",
    );
  }

  if (password.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD tiene que tener al menos 8 caracteres.");
  }

  const passwordHash = await hash(password);

  // upsert: correr el seed dos veces no debe romper ni pisar la contraseña
  // de un admin que ya existe y quizá ya la cambió.
  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: Role.ADMIN, active: true },
    create: { email, passwordHash, fullName, role: Role.ADMIN },
    select: { email: true, fullName: true, role: true },
  });

  console.log(`✔ Admin listo: ${admin.email} (${admin.fullName})`);
}

main()
  .catch((error) => {
    console.error("✕ Falló el seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
