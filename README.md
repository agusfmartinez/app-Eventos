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
| `npm run test:reportes` | Estadísticas, historial y exportación CSV (requiere el server) |
| `npm run test:espacios` | Espacios, cupo y detección de doble reserva (requiere el server) |
| `npm run test:calendario` | Grilla del calendario y ocupación (requiere el server) |
| `npm run test:usuarios` | Roles, permisos y asignación de recepción (requiere el server) |
| `npm run db:up` / `db:down` | Levanta/baja Postgres y Adminer |
| `npm run db:migrate` | Crea y aplica una migración (desarrollo) |
| `npm run db:deploy` | Aplica migraciones sin generar (producción) |
| `npm run db:seed` | Crea/actualiza el admin inicial |
| `npm run db:reset` | Borra la base y reaplica todo |
| `npm run db:studio` | Prisma Studio |

## Decisiones que conviene conocer antes de tocar el código

- **Postgres corre en Docker, Next corre en el host.** Contenerizar Next en
  desarrollo hace el hot-reload lento en Windows por el bind mount.

- **Tildá "Disable cache" en la pestaña Network de DevTools mientras
  desarrollás.** Turbopack sirve el CSS de desarrollo siempre en la misma URL
  (`/_next/static/chunks/[root-of-the-server]__…css`) y le cambia el contenido
  por debajo, así que el navegador se queda con la copia vieja y la página
  aparece a medio estilar. Medido en este proyecto: el navegador tenía 20.670
  bytes cuando el servidor ya servía 32.635, y las utilidades nuevas de
  Tailwind directamente no existían del lado del cliente.

  Con DevTools abierto y esa opción tildada no vuelve a pasar. Sin DevTools,
  el síntoma se corrige con `Ctrl+Shift+R`.

  Tres cosas que **no** son la solución, ya probadas y descartadas:
  - `next dev --webpack`: en Next 16 rompe el router del cliente con
    `Cannot read properties of undefined (reading 'get')` en
    `OuterLayoutRouter`.
  - `Cache-Control` propio sobre `/_next/static/*` desde `next.config.ts`:
    funciona, pero Next avisa que *"can break Next.js development behavior"* —
    incluso acotándolo solo a `.css`.
  - Borrar `.next`: no cambia nada, el problema está en el navegador.

  Nada de esto afecta a producción: ahí los assets llevan hash de contenido y
  se sirven `immutable`, verificado.

- **Desactivá Dark Reader (o cualquier extensión que altere el CSS) en
  `localhost`.** La app usa una paleta clara fija a propósito —el scanner usa
  el color como señal semántica— y estas extensiones reescriben los estilos y
  el DOM antes de que React hidrate. Síntomas: avisos de *hydration mismatch*
  con atributos `data-darkreader-*` y colores que no son los del diseño.

  Es un problema distinto del cacheo del CSS, aunque los dos se manifiesten
  como "se ven mal los estilos".

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

- **El puesto ("Puerta 1") lo define quien arma el evento, no quien escanea.**
  Sale de `event_staff.station_label` y la pantalla de recepción solo lo
  informa. Antes se escribía en cada teléfono y se guardaba en `localStorage`:
  alcanzaba un typo para que el historial mostrara dos puertas donde había
  una. El servidor lo resuelve solo en `confirmCheckInAction`, así que el
  cliente ya no puede mandar uno inventado.

- **Se inicia sesión con un nombre de usuario, no con el email.** Se genera
  solo: inicial del nombre + apellido, sin acentos ni símbolos.
  `Agustín Martínez` → `AMARTINEZ`. Los repetidos se numeran (`AMARTINEZ2`).
  El email es un dato de contacto opcional.

- **El username se genera una sola vez, en el alta.** Corregir el nombre o el
  apellido después no lo recalcula: es la credencial con la que la persona
  entra y ya la tiene anotada. Un typo en el apellido, arreglado un mes
  después, la dejaría afuera sin que nadie se entere.

- **Una contraseña temporal no se puede volver a mostrar.** Se guarda hasheada
  con argon2, que es de un solo sentido: la base permite verificarla, no
  reconstruirla. Si el admin la perdió, el camino es generar otra con
  "Resetear clave" — el resultado para el usuario es el mismo y evita tener
  credenciales legibles guardadas.

- **Las confirmaciones y las credenciales van en modal, no en `confirm()` ni
  en un cartel al costado.** El `confirm()` del navegador no se puede estilar
  y en mobile aparece pegado arriba, lejos del botón que lo disparó. El cartel
  verde con la contraseña se perdía entre las filas de la lista. `Modal` usa
  el `<dialog>` nativo: foco atrapado, Escape y top-layer los resuelve el
  navegador.

- **El admin nunca elige contraseñas.** Al crear una cuenta el sistema genera
  una temporal y se la muestra **una sola vez** para que se la pase a la
  persona; hasta que la cambie, `requireAuth` la desvía a `/cambiar-clave` y
  no la deja hacer nada más. El botón "Resetear clave" repite el ciclo: es el
  reemplazo del "olvidé mi contraseña" por email.

- **Las cuentas no se borran, se desactivan.** Un usuario borrado se llevaría
  la referencia de operador en los check-ins que registró, y el historial
  dejaría de decir quién dejó entrar a quién.

- **Tema claro y oscuro.** Arranca siguiendo la preferencia del dispositivo y
  hay un botón en la cabecera para forzar uno u otro; la elección se guarda por
  dispositivo. Un script en el `<head>` resuelve el tema **antes del primer
  pintado** — si se aplicara después de hidratar, la página parpadearía de
  claro a oscuro en cada carga.

  Dos superficies quedan fijas a propósito:
  - **La invitación pública siempre en claro.** El QR necesita módulos oscuros
    sobre fondo claro; invertido, varios lectores fallan.
  - **El sello del scanner usa `--ok-strong` / `--warn-strong` /
    `--deny-strong`, idénticos en ambos temas.** El operador tiene que ver
    siempre el mismo verde y el mismo rojo, sin importar cómo tenga
    configurado el teléfono.

- **Roles.** Los tres son personal del salón. El anfitrión —el cliente que
  contrata el evento— **no** tiene cuenta en el sistema.

  | | Admin | Organizador | Recepción |
  |---|---|---|---|
  | Crear y editar eventos | ✓ | ✓ | |
  | Cancelar un evento | ✓ | ✓ | |
  | **Eliminar** un evento | ✓ | | |
  | Invitados, invitaciones, espacios | ✓ | ✓ | |
  | Asignar recepción a un evento | ✓ | ✓ | |
  | Escanear y registrar ingresos | ✓ | ✓ | solo asignados |
  | Crear cuentas y cambiar roles | ✓ | | |

- **Solo los administradores gestionan cuentas.** Quien puede crear usuarios
  puede crearse un admin, así que dárselo al organizador lo convertiría en
  administrador de hecho. Asignar recepción a un evento sí lo puede hacer el
  organizador: es parte de organizar y no otorga permisos nuevos.

- **No se puede dejar el sistema sin administradores activos.** Ni
  desactivarse uno mismo. Sin esos dos frenos, la única salida sería editar la
  base a mano.

- **El día del salón arranca a las 08:00**, no a la medianoche
  (`VENUE_DAY_START_MIN` en [`lib/schedule.ts`](lib/schedule.ts)). Una fiesta
  de 21:00 a 05:00 pertenece a la noche del 15, no mitad al 15 y mitad al 16:
  con la ventana anclada a las 08:00 se ve entera en una sola pantalla.

- **Dos eventos no pueden pisarse en el mismo espacio.** Se valida al guardar
  en [`lib/actions/events.ts`](lib/actions/events.ts) y se rechaza. Si hace
  falta un solapamiento real, la salida es dejar uno de los dos sin espacio
  asignado. Los cancelados no ocupan; los borradores sí, porque son
  pre-reservas.

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
- [x] **Fase 5** — Dashboard, historial de ingresos y exportación CSV
- [x] **Fase 6** — Espacios / sub-salones, cupo del evento y doble reserva
- [x] **Fase 7** — Calendario de disponibilidad (vista mes y día)
- [x] **Fase 8** — Usuarios, roles y asignación de recepción
- [ ] Fase 9 — Escaneo sin elegir evento (ver `ROADMAP.md`)
- [ ] Fase 6 — Importación CSV
- [ ] Fase 7 — Roles y autorización estricta
- [ ] Fase 8 — WhatsApp Business API (opcional)
