# Sistema de gestión de eventos y control de acceso

Aplicación para un salón de eventos: administrar eventos e invitados, generar
invitaciones digitales con QR y controlar el ingreso desde un celular.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS 4 |
| ORM | Prisma 7 (driver adapter `@prisma/adapter-pg`) |
| Base de datos | PostgreSQL 17 |
| Auth | Auth.js v5 (Credentials + argon2id) |

No hay backend separado: las Server Actions y los Route Handlers de Next
**son** el backend.

## Puesta en marcha

Requiere Node 22+ y Docker Desktop.

```bash
# 1. dependencias
npm install

# 2. variables de entorno
cp .env.example .env        # y generar AUTH_SECRET: npx auth secret

# 3. base de datos (contenedor)
npm run db:up

# 4. esquema + usuario admin inicial
npm run db:migrate
npm run db:seed

# 5. app
npm run dev
```

Abre <http://localhost:3000>. Las credenciales del admin salen de
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` en el `.env`.

Adminer (inspección de la base): <http://localhost:8080>

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Next en modo desarrollo |
| `npm run build` | Build de producción (salida `standalone`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:smoke` | Smoke test de auth (requiere `npm run dev` corriendo) |
| `npm run test:eventos` | Smoke test de eventos e invitados (ídem) |
| `npm run db:up` / `db:down` | Levanta/baja Postgres y Adminer |
| `npm run db:migrate` | Crea y aplica una migración (desarrollo) |
| `npm run db:deploy` | Aplica migraciones sin generar (producción) |
| `npm run db:seed` | Crea/actualiza el admin inicial |
| `npm run db:reset` | Borra la base y reaplica todo |
| `npm run db:studio` | Prisma Studio |

## Decisiones que conviene conocer antes de tocar el código

- **Postgres corre en Docker, Next corre en el host.** Contenerizar Next en
  desarrollo hace el hot-reload lento en Windows por el bind mount.

- **Después de cambiar el esquema, reiniciá `npm run dev`.** El cliente de
  Prisma se cachea en `globalThis` (ver [`lib/db.ts`](lib/db.ts)) para que el
  hot-reload no abra un pool nuevo en cada cambio. El efecto secundario es que
  un cliente regenerado no se recoge hasta reiniciar el proceso: si no
  reiniciás, aparecen errores del tipo `The column X does not exist`.

- **La autorización vive en la aplicación, no en la base.** Sin RLS, toda
  página protegida y **toda Server Action** tiene que empezar llamando a
  `requireAuth()` de [`lib/authz.ts`](lib/authz.ts). Una acción sin guard es un
  agujero directo.

- **`requireAuth()` consulta la base en cada request.** Es a propósito: la
  sesión es un JWT, así que sin esa consulta un operador desactivado seguiría
  entrando hasta que expire el token.

- **El estado de una invitación es derivado.** `INGRESADO` y `PARCIALMENTE
  INGRESADO` no se guardan: salen de comparar `enteredCount` con `maxPeople`.

- **El check-in tiene que ser atómico.** Va dentro de una transacción con
  `SELECT ... FOR UPDATE`, más un `CHECK (entered_count <= max_people)` en la
  base como última red. Nunca modificar `enteredCount` fuera de esa transacción.

- **Las horas de evento son strings `"HH:MM"`.** Guardarlas como timestamp
  arrastra zona horaria y desordena el historial.

- **El scanner necesita HTTPS.** `getUserMedia()` no da acceso a la cámara sin
  contexto seguro. En `localhost` funciona; desde un celular contra la IP de la
  LAN, no.

## Estado

- [x] **Fase 1** — Docker, base de datos, esquema, autenticación, roles, panel base
- [x] **Fase 2** — CRUD de eventos e invitados, búsqueda, auditoría
- [ ] Fase 3 — Invitaciones, QR y link público `/i/:token`
- [ ] Fase 4 — Scanner y check-in atómico
- [ ] Fase 5 — Dashboard e historial
- [ ] Fase 6 — Importación CSV
- [ ] Fase 7 — Roles y autorización estricta
- [ ] Fase 8 — WhatsApp Business API (opcional)
