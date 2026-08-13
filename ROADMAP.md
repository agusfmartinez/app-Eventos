# Roadmap y backlog

Estado de las fases y análisis de las funcionalidades pedidas por el cliente
que todavía no están construidas.

> El análisis técnico completo (arquitectura, modelo de datos, decisiones)
> está en `ANALISIS.md`, que **no se commitea** — figura en `.gitignore`.

---

## Estado actual

| Fase | Estado |
|---|---|
| 1. Base: Docker, esquema, autenticación, roles | ✅ hecha |
| 2. CRUD de eventos e invitados | ✅ hecha |
| 3. QR, link público, imagen, WhatsApp | ✅ hecha |
| 4. Scanner y check-in atómico | ✅ hecha |
| 5. Dashboard, historial y exportación CSV | ✅ hecha |
| 6. Espacios / sub-salones, cupo y doble reserva | ✅ hecha |
| 7. Calendario de disponibilidad | ✅ hecha |
| 8. Usuarios y asignación de recepción | ✅ hecha |
| 9. Escaneo sin elegir evento | ✅ hecha |

Lo que queda son los dos pedidos más grandes: el formulario público de registro
(10) y WhatsApp Business API (11).

---

# Pedidos del cliente — análisis de viabilidad

## A. Escaneo sin elegir evento

> Que el personal de puerta abra el control de acceso y escanee directamente,
> sin tener que seleccionar el evento. Que el propio QR determine a qué evento
> pertenece la invitación, para no tener que preguntarle al invitado.
> Que solo vea los eventos del día y en modo lectura.

**Viable. Y además simplifica lo que ya existe.**

Hoy el operador elige el evento y el token se valida contra ese evento; si no
coincide, sale `INVITACIÓN DE OTRO EVENTO`. Pero el token **ya identifica** de
forma única a la invitación, y por lo tanto a su evento: el paso de elegir es
información que el sistema ya tiene.

### Cómo cambiaría

El flujo pasa de *"elegí evento → escaneá"* a *"escaneá → el sistema resuelve
el evento"*. La validación se invierte:

1. El token resuelve la invitación y su evento.
2. Se verifica que el operador tenga acceso a **ese** evento.
3. Se verifica que el evento esté activo hoy.
4. Recién ahí se aplican las reglas de admisión actuales, sin cambios.

El resultado `WRONG_EVENT` no desaparece, cambia de significado: pasa de "no es
el evento que elegiste" a "esta invitación no es para hoy" o "no tenés acceso a
ese evento". Los otros seis resultados quedan igual.

### La trampa: qué significa "hoy"

Una fiesta con fecha 15/08 y hora de fin 05:00 **sigue en curso a las 03:00 del
16/08**. Filtrar por `event_date = hoy` dejaría al operador sin poder escanear
justo en la madrugada, que es cuando más gente se va y vuelve a entrar.

La ventana correcta no es el día calendario sino algo como: eventos de hoy, más
los de ayer cuya hora de fin sea de madrugada y todavía no haya pasado. Hay que
definirlo explícitamente, no dejarlo librado a `event_date = CURRENT_DATE`.

Es el mismo tipo de error que ya evitamos al no validar `hora_fin > hora_inicio`.

### Modo lectura para el rol de puerta

Ya está: el rol `DOOR` no puede abrir el panel ni editar nada, y está cubierto
por tests (`npm run test:scanner`). Lo único que faltaría es mostrarle algo de
contexto del evento detectado —nombre, horario— junto al resultado del escaneo.

### Esfuerzo y dependencias

Chico a medio. Depende de la **Fase 7**: sin pantalla de asignación de
operadores, el filtro "eventos a los que tenés acceso" se sigue administrando
por SQL.

---

## B. Espacios o sub-salones

> Poder indicar a qué salón pertenece el evento, porque el salón tiene varios
> espacios y puede haber eventos simultáneos.

**Viable, y es de las más baratas de la lista.**

Importante: esto **no** es multi-tenant. En el análisis inicial se decidió "un
solo salón" y esa decisión sigue en pie — no hay varios clientes ni hay que
aislar datos entre organizaciones. Es un catálogo de espacios dentro del mismo
salón, que es muchísimo más liviano.

### Modelo

- Tabla `spaces`: `id`, `name`, `capacity` (opcional), `active`.
- `events.space_id`, nullable — un evento puede no tener espacio asignado.
- Selector en el formulario de evento y columna en el panel.

### El valor que no es obvio

Con espacios se puede **detectar doble reserva**: dos eventos en el mismo
espacio con horarios que se pisan. Para un salón que alquila tres ambientes, ese
chequeo probablemente valga más que el campo en sí. Conviene que avise en vez de
bloquear: a veces se solapan a propósito (armado, desarme).

### Relación con el punto A

Se potencian. Con dos fiestas la misma noche en espacios distintos, el escaneo
libre resuelve solo cuál es cuál — el operador de la puerta común no tiene que
preguntar nada.

### Esfuerzo

Chico. Migración, CRUD mínimo y un selector.

---

## C. Formulario público de registro de invitados

> Enviar un link de formulario para que los invitados se registren solos y se
> genere su invitación automáticamente, evitando la carga manual.

**Viable, pero es el pedido más delicado de los cuatro.** No por dificultad
técnica sino por seguridad.

### Por qué es delicado

El link de registro es, en la práctica, **una credencial que permite crear
invitaciones válidas**. Y va a circular por WhatsApp, que es exactamente el
medio donde se reenvía todo. Si el registro habilita la entrada
automáticamente, cualquiera que reciba el link se fabrica su propio pase.

Para un casamiento, eso es peor que la carga manual.

### Sobre "que lo comparta el anfitrión"

> La idea es que el anfitrión comparta el link con sus invitados, y así se
> evita que cualquiera se registre.

**Que lo reparta el anfitrión mejora mucho el flujo, pero no restringe quién
puede registrarse.** Es un link portador: quien lo tenga, entra al formulario,
lo haya recibido del anfitrión o de un reenvío. Y en un grupo de WhatsApp de
casamiento se reenvía todo.

O sea: es la forma correcta de **distribuirlo**, no un control de acceso. La
distinción importa porque de ella depende si hace falta moderar o no.

Lo que sí controla de verdad quién termina entrando:

- que la invitación nazca en **`PENDING`** y el organizador apruebe,
- el **tope de invitaciones** del formulario,
- la **fecha límite** y poder cerrarlo,
- el **cupo del evento** (punto D), que le pone un techo natural.

Con esos controles, que el link se filtre deja de ser un problema: el que se
cuela queda en una lista de pendientes que alguien revisa, no en la puerta con
un QR válido.

Si más adelante se quiere control real de quién se registra, el camino es darle
al anfitrión una **cuenta propia** con acceso de solo lectura a su evento y a su
lista, y que él apruebe. Eso lo convierte en un actor del sistema —hoy solo
existe el personal del salón— y es bastante más trabajo.

### Diseño propuesto

- El **evento** tiene un token de registro propio (distinto del de cada
  invitación), con estos controles:
  - se puede abrir y cerrar,
  - fecha límite,
  - **tope de invitaciones** que se pueden generar por el formulario,
  - tope de personas por registro (que no se anoten de a diez).
- El invitado carga nombre, apellido, teléfono y cantidad de personas.
- La invitación se crea en estado **`PENDING`, no `ENABLED`**. El organizador
  las aprueba —de a una o en lote— desde el panel. Ese estado ya existe en el
  modelo y el scanner ya lo muestra en amarillo.
- Recién al aprobar se le manda la invitación.

Dejar la aprobación como configurable ("auto-aprobar registros") es razonable,
pero el valor por defecto tiene que ser el seguro.

### Otros riesgos concretos

| Riesgo | Mitigación |
|---|---|
| Spam automatizado contra un endpoint público de escritura | Rate limiting por IP (ya existe el limitador) + tope por evento + cierre del formulario |
| La misma persona se registra dos veces | Deduplicar por teléfono dentro del evento |
| Se anotan con 8 acompañantes | Tope por registro configurable |
| El link se filtra a gente no invitada | Es el escenario esperado: por eso el estado `PENDING` por defecto |

### Esfuerzo

Medio, y es el más grande de los cuatro. Suma un flujo público de escritura
—hoy la única ruta pública es de solo lectura— más una pantalla de moderación.

---

## D. Calendario de disponibilidad

> Mientras crea el evento y está en contacto con el anfitrión, poder ver en
> tiempo real qué días y horarios ya están reservados en cada sub-salón, para
> decirle en el momento qué disponibilidad hay.
> **Sin integración con Google.** El calendario vive dentro de la app.

Esta definición cambia el pedido por completo. No es sincronizar agendas: es
**una herramienta de venta**. Se usa con el anfitrión del otro lado del
teléfono, y la pregunta que tiene que contestar en segundos es *"¿tenés libre
el 15 de noviembre a la noche en el salón chico?"*.

Eso sube su prioridad. Un calendario de agenda se mira de vez en cuando; este
se usa en cada llamada de venta.

Y descarta las dos opciones externas del análisis anterior: no hace falta
`.ics` ni la API de Google.

### Qué implica técnicamente

**Depende de los espacios (punto B).** La disponibilidad se responde por
sub-salón, así que sin `spaces` el calendario no puede contestar la pregunta
que le da sentido.

**Hace falta calcular intervalos reales.** Hoy el evento guarda `event_date`
(fecha) más `start_time` y `end_time` como texto `"HH:MM"`. Para detectar
solapamientos hay que construir el intervalo `[inicio, fin]`, y ahí reaparece
el caso de siempre: si `end_time < start_time`, el fin es al día siguiente. Una
fiesta de 21:00 a 05:00 ocupa dos fechas de calendario y **bloquea la mañana
siguiente**, no solo su propia noche.

Si eso no se contempla, el sistema va a ofrecer como libre un sábado a las
09:00 en el que todavía se está desarmando la fiesta del viernes.

**La reserva provisoria ya tiene dónde vivir.** Durante una negociación el
evento no está confirmado. El estado `DRAFT` que ya existe sirve como
pre-reserva: se muestra en el calendario con otro color y ocupa el espacio,
pero no aparece en el control de acceso —eso ya funciona así.

### Vistas

1. **Mes por espacio** — la grilla clásica, filtrable por sub-salón, para ver
   el panorama.
2. **Día** — franjas horarias con los espacios en columnas. Es la que contesta
   *"el 15 a la noche, ¿qué tengo?"* de un vistazo.

### Límite de cupos por evento

> Poder definir un límite de invitados para ese evento.

Encaja acá y es barato:

- `spaces.capacity` — capacidad física del sub-salón.
- `events.max_guests` — cupo pactado con el anfitrión; se propone por defecto
  desde la capacidad del espacio y se puede bajar.
- Al cargar invitados, avisar cuando la suma de personas autorizadas se acerca
  o supera el cupo.

**Avisar, no bloquear.** El cupo es un acuerdo comercial, no una restricción
física exacta, y el organizador puede tener motivos para pasarse por dos
personas. Bloquear un alta a las 11 de la noche antes del evento sería peor que
el problema que resuelve.

### Esfuerzo

Medio. El grueso está en el cálculo de solapamientos y en la vista de día.

---

## E. Asignar usuarios de recepción a los eventos

> Que el admin pueda asignar los usuarios de "recepción" o los que van a estar
> en la puerta controlando el acceso.

**Ya estaba planificado como Fase 7 y el modelo ya lo soporta.** La tabla
`event_staff` existe, el scanner la respeta y hay tests que verifican el
aislamiento. Lo único que falta es la pantalla: hoy la asignación se hace con
un `INSERT` a mano (ver README).

Alcance:

- ABM de usuarios del personal (crear, desactivar, cambiar rol).
- Asignar y desasignar operadores por evento, con su puesto.

Vale la pena renombrar el rol en la interfaz: el cliente dice **"recepción"**,
no "control de acceso". El código puede seguir usando `DOOR`; lo que ve el
usuario debería usar su palabra.

Esfuerzo: medio. Es la que **destraba el punto A**.

---

# Orden propuesto

| # | Qué | Esfuerzo | Por qué en este orden |
|---|---|---|---|
| ~~6~~ | ~~Importación CSV~~ | — | **Descartada.** La carga masiva va a resolverse con el formulario de registro |
| ✅ **6** | Espacios / sub-salones + cupo del evento (**B**) | chico | **Hecha.** Incluye `lib/schedule.ts`, la base de cálculo que va a usar el calendario |
| ✅ **7** | Calendario de disponibilidad (**D**) | medio | **Hecha.** Vista mes y vista día por espacio, con ventana anclada a las 08:00 |
| ✅ **8** | Usuarios y asignación de recepción (**E**) | medio | **Hecha.** ABM de cuentas solo para admins, asignación por evento con puesto |
| ✅ **9** | Escaneo sin elegir evento (**A**) | medio | **Hecha.** El QR resuelve el evento; la ventana es la jornada del salón, no el día calendario. La ficha por evento quedó como vista de solo lectura para recepción |
| **10** | Formulario de registro de invitados (**C**) | medio-alto | Lo más grande y lo único que abre escritura al público |
| **11** | WhatsApp Business API | medio | Como estaba: opcional |

> **Consecuencia de descartar el CSV:** hasta que exista el formulario de
> registro, la única forma de cargar invitados es de a uno por el panel. Para
> un evento de 200 invitados eso es varias horas de tipeo. Si el formulario se
> demora, conviene adelantarlo o reponer una importación mínima.

### Por qué este orden

**El calendario subió.** Con la definición nueva dejó de ser una comodidad y
pasó a ser la herramienta que se usa mientras se cierra cada venta. Eso es uso
diario, contra el scanner que se usa las noches de evento.

**Espacios va justo antes** porque el calendario responde disponibilidad *por
sub-salón*: sin esa tabla, no puede contestar la pregunta que lo justifica.

**El formulario de registro queda último** no por difícil, sino porque es el
único que abre una puerta de escritura al público y conviene hacerlo con todo
lo demás estable.

**Alternativa razonable:** si el cliente necesita repartir la carga de
invitados antes que vender fechas, se pueden intercambiar la 6 y el bloque
7-8. Nada depende de la importación CSV.
