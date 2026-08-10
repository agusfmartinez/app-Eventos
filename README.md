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
| `npm run test:invitaciones` | Smoke test del QR, link público e imagen (ídem) |
| `npm run test:scanner` | Permisos del control de acceso (ídem) |
| `npm run test:concurrencia` | **Check-in atómico bajo carga. No necesita el server.** |
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

- **El check-in tiene que ser atómico.** Vive en
  [`lib/checkin.ts`](lib/checkin.ts), dentro de una transacción con
  `SELECT ... FOR UPDATE`, más un `CHECK (entered_count <= max_people)` en la
  base como última red. **Nunca modificar `enteredCount` fuera de
  `confirmCheckIn`.** Si tocás ese archivo, corré `npm run test:concurrencia`.

- **Asignar operadores a eventos todavía se hace por SQL.** La tabla
  `event_staff` funciona y el scanner la respeta, pero la pantalla para
  administrarla llega en la Fase 7. Mientras tanto:

  ```sql
  INSERT INTO event_staff (event_id, user_id, station_label, created_at)
  VALUES ('<event-uuid>', '<user-uuid>', 'Puerta 1', now());
  ```

- **Las horas de evento son strings `"HH:MM"`.** Guardarlas como timestamp
  arrastra zona horaria y desordena el historial.

- **`APP_URL` es lo que se codifica en el QR.** Si queda en `localhost`, los QR
  generados no funcionan fuera de esta máquina. Antes de mandar invitaciones
  reales tiene que apuntar al dominio público.

- **La imagen de la invitación la renderiza Satori, no un navegador.** Solo
  soporta flexbox, y **todo `<div>` con más de un hijo necesita
  `display: flex`** — incluidas las interpolaciones: `{a} {b}` cuentan como
  varios hijos. De ahí que en
  [`app/i/[token]/imagen/route.tsx`](app/i/[token]/imagen/route.tsx) los textos
  compuestos se armen como un único template string.

- **Para probar el scanner en un teléfono real** hace falta HTTPS *y* que el
  origen esté en `allowedDevOrigins` de
  [`next.config.ts`](next.config.ts). El server de desarrollo responde `403` a
  los pedidos de `/_next/*` que vengan de otro origen: la página carga, el
  JavaScript no, y la pantalla queda con los botones muertos **sin ningún
  error visible**. Si usás un túnel nuevo, agregá su dominio ahí y reiniciá
  (`next.config.ts` no se recarga en caliente).

- **El scanner tiene un panel "Diagnóstico de la cámara"** plegado al pie.
  Registra permisos, dispositivos y cada paso del arranque. Es la única forma
  de depurar desde un celular, donde no hay consola del navegador.

- **El scanner necesita HTTPS.** `getUserMedia()` no da acceso a la cámara sin
  contexto seguro. En `localhost` funciona; desde un celular contra la IP de la
  LAN, no.

## Estado

- [x] **Fase 1** — Docker, base de datos, esquema, autenticación, roles, panel base
- [x] **Fase 2** — CRUD de eventos e invitados, búsqueda, auditoría
- [x] **Fase 3** — QR, link público `/i/:token`, imagen descargable, WhatsApp
- [x] **Fase 4** — Scanner con cámara y check-in atómico
- [ ] Fase 5 — Dashboard e historial
- [ ] Fase 6 — Importación CSV
- [ ] Fase 7 — Roles y autorización estricta
- [ ] Fase 8 — WhatsApp Business API (opcional)
