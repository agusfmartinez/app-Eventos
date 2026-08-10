import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verify } from "@node-rs/argon2";
import { z } from "zod";

import { prisma } from "@/lib/db";
import type { Role } from "@/lib/generated/prisma/enums";

// Hash real de una contraseña descartable. Se verifica contra este hash cuando
// el email no existe, para que el login tarde lo mismo exista o no el usuario.
// Sin esto, la diferencia de tiempo revela qué emails están registrados.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$qoCcrbcKUYppXza506/11g$s2dBdUmlw53nb+/yLGy8TWl0jxj5fKKjmruPRJRTQc8";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

declare module "next-auth" {
  interface User {
    role: Role;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
    };
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Credentials solo soporta estrategia JWT. La revocación inmediata la
  // resuelve requireAuth() en lib/authz.ts, que revalida contra la base en
  // cada request protegido — ver el comentario ahí.
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });

        const ok = await verify(
          user?.passwordHash ?? DUMMY_HASH,
          parsed.data.password,
        ).catch(() => false);

        // Un solo `return null` para todos los casos de fallo: no distinguimos
        // "no existe" de "contraseña incorrecta" de "desactivado".
        if (!user || !user.active || !ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    // El JWT es un mapa de unknown, así que estos dos casts son inevitables.
    // Son seguros porque los valores los escribe el callback de arriba, y de
    // todos modos requireAuth() vuelve a leer rol y estado desde la base.
    session: ({ session, token }) => {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      return session;
    },
  },
});
