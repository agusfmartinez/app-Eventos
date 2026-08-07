# Sistema de gestión de eventos y control de acceso

Quiero que trabajes en este proyecto como **arquitecto y desarrollador senior full-stack**.

Antes de modificar o crear código, necesito que **analices el repositorio completo y entiendas qué existe actualmente**, incluyendo arquitectura, stack, estructura de carpetas, base de datos, autenticación, componentes reutilizables y convenciones del proyecto.

**No empieces a implementar inmediatamente. Primero inspeccioná y comprendé el proyecto.**

---

## 1. Objetivo de la aplicación

Necesitamos construir una aplicación para un **salón de eventos** que permita administrar múltiples eventos y controlar el acceso de los invitados.

Ejemplos de eventos:

- Casamientos
- Cumpleaños
- Fiestas de 15
- Eventos corporativos
- Fiestas privadas
- Otros eventos

Cada evento puede tener:

- Nombre
- Fecha
- Hora de inicio
- Hora de finalización
- Ubicación
- Imagen/portada
- Información adicional
- Lista de invitados
- Estado del evento

Un salón puede tener muchos eventos en diferentes fechas y horarios.

---

# 2. Concepto principal

La aplicación tiene **dos partes principales**:

### A. Panel administrativo

Lo utiliza el personal del salón para:

- Crear eventos
- Editar eventos
- Eliminar/cancelar eventos
- Administrar invitados
- Generar invitaciones
- Habilitar/bloquear invitados
- Ver quién ingresó
- Ver estadísticas de ingreso
- Controlar el acceso manualmente
- Consultar el historial

### B. Sistema de control de acceso

Lo utiliza el personal que está en la entrada del salón.

Desde un celular, tablet o computadora con cámara deben poder:

1. Seleccionar el evento.
2. Abrir el escáner.
3. Escanear el QR de una invitación.
4. Consultar inmediatamente si la invitación es válida.
5. Mostrar claramente si se permite o se rechaza el ingreso.
6. Registrar el ingreso.

El invitado **NO debe instalar ninguna aplicación**.

---

# 3. Experiencia del invitado

El invitado recibe su invitación principalmente por WhatsApp.

La invitación puede ser una **imagen digital**, por ejemplo:

```text
┌─────────────────────────────┐
│                             │
│       CASAMIENTO            │
│       JUAN & MARÍA          │
│                             │
│       JUAN PÉREZ            │
│                             │
│       15 AGOSTO 2026        │
│       21:00 HS              │
│                             │
│          [ QR ]             │
│                             │
│       2 PERSONAS            │
│                             │
└─────────────────────────────┘
```

Además, idealmente el mensaje de WhatsApp puede incluir un link.

Ejemplo:

`https://dominio.com/i/XXXXXXXX`

Cuando el invitado abre ese link, debe poder ver una versión web de su invitación adaptada al celular.

**No debe requerir login ni instalación de aplicación.**

---

# 4. Invitación única

Cada invitación debe tener un identificador/token único y seguro.

El QR NO debería contener información sensible del invitado.

Idealmente debería contener únicamente un token aleatorio que permita identificar la invitación en el backend.

Ejemplo conceptual:

```text
https://dominio.com/access/8f92KxP71...
```

El backend debe determinar:

- Si el token existe.
- A qué evento pertenece.
- A qué invitado pertenece.
- Cuántas personas permite.
- Cuántas personas ya ingresaron.
- Si está habilitado.
- Si está bloqueado.
- Si el evento corresponde al evento seleccionado en el scanner.
- Si la invitación ya fue utilizada.

---

# 5. Invitados

Cada evento tendrá una lista de invitados.

Un invitado debería poder tener:

- Nombre
- Apellido
- Teléfono
- Email (opcional)
- Cantidad de personas permitidas
- Cantidad de personas que ingresaron
- Estado
- Invitación asociada
- Fecha de creación
- Observaciones

Ejemplo:

```text
Juan Pérez
2 personas
Estado: Habilitado
Ingresaron: 0/2
```

---

# 6. Estados de una invitación/invitado

Necesitamos contemplar como mínimo:

### HABILITADO

Puede ingresar.

### BLOQUEADO

No puede ingresar aunque tenga una invitación válida.

### INGRESADO

Ya utilizó la totalidad de las personas permitidas.

### PARCIALMENTE INGRESADO

Por ejemplo:

```text
Permitidos: 4
Ingresaron: 2
```

Todavía pueden ingresar 2 personas.

### PENDIENTE

Estado opcional para invitados que todavía no fueron confirmados.

La implementación final debe definir claramente si estos estados pertenecen al invitado, a la invitación o son derivados de los datos.

---

# 7. Control de acceso

Este es uno de los módulos más importantes.

El scanner debe tener una interfaz extremadamente simple.

Ejemplo:

```text
CONTROL DE ACCESO

Evento:
[ Casamiento Juan & María ]

┌─────────────────────────┐
│                         │
│      ESCANEAR QR        │
│                         │
│       📷 Cámara         │
│                         │
└─────────────────────────┘
```

Después de escanear:

## Caso válido

Mostrar algo muy claro:

```text
✓ ACCESO AUTORIZADO

Juan Pérez

2 personas permitidas
0 personas ingresaron

[ PERMITIR INGRESO ]
```

El operador debe poder indicar cuántas personas están ingresando.

Por ejemplo:

```text
Personas que ingresan:

[-] 2 [+]

[ CONFIRMAR INGRESO ]
```

Al confirmar, registrar el ingreso.

---

## Caso parcialmente utilizado

```text
⚠ ACCESO PARCIAL

Juan Pérez

Permitidos: 4
Ya ingresaron: 2
Disponibles: 2

¿Cuántas personas ingresan?

[-] 1 [+]

[ CONFIRMAR ]
```

---

## Caso bloqueado

```text
✕ ACCESO DENEGADO

Juan Pérez

Esta invitación está bloqueada.

[ VOLVER ]
```

---

## Caso QR inexistente

```text
✕ QR INVÁLIDO

No encontramos una invitación asociada.

[ VOLVER ]
```

---

## Caso QR de otro evento

```text
✕ INVITACIÓN INCORRECTA

Esta invitación pertenece a otro evento.

Evento:
Cumpleaños Martín

Evento actual:
Casamiento Juan & María
```

---

## Caso invitación agotada

```text
✕ ACCESO DENEGADO

La cantidad de personas permitidas
ya ingresó.

Permitidos: 2
Ingresaron: 2
```

---

# 8. Registro de ingresos

Cada ingreso debe quedar registrado.

Necesitamos poder saber:

- Invitado
- Evento
- Invitación
- Cantidad de personas que ingresaron
- Fecha
- Hora
- Usuario/operador que realizó el check-in
- Dispositivo/puesto de control si corresponde

Ejemplo:

```text
Juan Pérez
Casamiento Juan & María
2 personas
15/08/2026 22:47:31
Control de acceso 1
Operador: Carlos
```

El historial debe permitir consultar posteriormente los ingresos.

---

# 9. Concurrencia

Esto es MUY IMPORTANTE.

Puede haber varios teléfonos/tablets escaneando invitaciones simultáneamente.

La validación y el registro del ingreso deben hacerse de forma **atómica en el backend/base de datos**.

Ejemplo:

Una invitación permite 2 personas.

Dos operadores escanean simultáneamente el mismo QR.

No debe ocurrir:

```text
Operador A → ve 0/2 → permite 2
Operador B → ve 0/2 → permite 2
Resultado → 4/2
```

El sistema debe garantizar que nunca se supere la cantidad autorizada debido a una condición de carrera.

Analizá y elegí una estrategia adecuada según el stack existente, por ejemplo:

- transacciones
- locks
- funciones SQL
- operaciones atómicas
- constraints
- u otra solución apropiada.

---

# 10. Panel administrativo

El dashboard debería permitir visualizar:

```text
EVENTOS

Hoy
────────────────────────────

Casamiento Juan & María
15/08/2026
220 invitados
187 ingresaron

Cumpleaños Martín
22/08/2026
75 invitados
0 ingresaron

Fiesta Empresa XYZ
29/08/2026
300 invitados
0 ingresaron
```

Dentro de cada evento:

```text
Casamiento Juan & María

Invitados: 220
Confirmados: 210
Ingresaron: 187
Pendientes: 23
Bloqueados: 3

[ Agregar invitado ]
[ Importar invitados ]
[ Generar invitaciones ]
[ Control de acceso ]
```

---

# 11. Gestión de invitados

Debe ser posible:

- Crear invitado.
- Editar invitado.
- Eliminar/desactivar invitado.
- Bloquear invitado.
- Habilitar invitado.
- Modificar cantidad de personas.
- Buscar por nombre.
- Buscar por teléfono.
- Ver invitación.
- Regenerar invitación si corresponde.
- Ver historial de ingresos.

También sería muy útil poder **importar invitados desde CSV/Excel**.

Ejemplo:

```text
Nombre,Apellido,Telefono,Personas
Juan,Perez,1122334455,2
Maria,Gonzalez,1166778899,1
Pedro,Rodriguez,1155555555,4
```

Analizá el repositorio antes de decidir el formato final.

---

# 12. Invitaciones

El sistema debería poder generar una invitación visual.

Idealmente:

- Diseño configurable.
- Nombre del evento.
- Nombre del invitado.
- Fecha.
- Hora.
- Ubicación.
- Cantidad de personas.
- QR.
- Imagen/branding del salón.

Debe existir una forma de **previsualizar la invitación** antes de enviarla.

Inicialmente NO es obligatorio automatizar el envío por WhatsApp.

El flujo inicial puede ser:

```text
Crear invitación
↓
Generar imagen
↓
Descargar
↓
Enviar manualmente por WhatsApp
```

Pero la arquitectura debería dejar abierta la posibilidad de integrar posteriormente **WhatsApp Business API** para automatizar el envío.

---

# 13. Link público de invitación

Cada invitación debería tener una URL pública única.

Ejemplo:

```text
/i/:token
```

Debe mostrar la invitación sin requerir autenticación.

Sin embargo:

- No debe exponer información innecesaria.
- El token debe ser suficientemente aleatorio.
- No debe utilizar IDs incrementales como mecanismo de seguridad.
- Debe poder invalidarse si la invitación es bloqueada/cancelada.

---

# 14. Seguridad

Prestá especial atención a:

- Autenticación del panel administrativo.
- Autorización por rol.
- Tokens de invitaciones.
- Validación de QR en backend.
- Rate limiting donde corresponda.
- No confiar en validaciones realizadas solamente en frontend.
- Evitar que un usuario pueda modificar invitados/eventos que no debería.
- No exponer datos sensibles en URLs.
- Evitar duplicación de check-ins.
- Registrar acciones administrativas importantes.

---

# 15. Roles

Dejar preparada la arquitectura para diferentes tipos de usuarios.

Por ejemplo:

### ADMIN

Puede hacer todo.

### ORGANIZADOR

Puede administrar eventos e invitados.

### CONTROL DE ACCESO

Solamente puede:

- seleccionar eventos autorizados
- escanear QR
- registrar ingresos
- consultar la información mínima necesaria.

No debería poder modificar invitados ni eventos.

---

# 16. Requisito fundamental: facilidad de uso

La aplicación será utilizada potencialmente por personal que **no es técnico**.

Por lo tanto:

- El scanner debe ser extremadamente simple.
- Los resultados deben ser visualmente obvios.
- Verde = permitido.
- Rojo = rechazado.
- Amarillo = requiere atención.
- Los botones deben ser grandes.
- La interfaz debe funcionar muy bien desde celulares.
- Evitar pasos innecesarios.

El operador de puerta debería poder hacer:

```text
Escanear
→ Leer resultado
→ Confirmar cantidad
→ Registrar ingreso
→ Escanear siguiente
```

en pocos segundos.

---

# 17. Antes de programar

Primero analizá el repositorio.

Necesito que identifiques:

1. Stack tecnológico actual.
2. Frameworks utilizados.
3. Estructura del frontend.
4. Estructura del backend.
5. Base de datos.
6. Sistema de autenticación.
7. Sistema de roles/permisos existente.
8. Componentes reutilizables.
9. Convenciones de código.
10. Sistema de routing.
11. Manejo de estado.
12. Manejo de errores.
13. Variables de entorno.
14. Sistema de despliegue.
15. Tests existentes.
16. Dependencias relevantes.
17. Qué funcionalidades ya existen que podemos reutilizar.

**No reemplaces tecnologías existentes sin una razón fuerte.**

---

# 18. Luego del análisis

Antes de escribir código, entregame un informe breve con:

### Arquitectura actual

Qué tenemos y cómo funciona.

### Arquitectura propuesta

Cómo implementarías este sistema aprovechando lo existente.

### Modelo de datos

Qué tablas/colecciones proponés y sus relaciones.

Por ejemplo, conceptualmente:

```text
users
events
guests
invitations
check_ins
```

Pero **no asumas que estos nombres son definitivos**. Adaptalos al proyecto existente.

### Flujos principales

Describí:

1. Crear evento.
2. Crear/importar invitado.
3. Generar invitación.
4. Mostrar invitación pública.
5. Escanear QR.
6. Validar acceso.
7. Registrar ingreso.
8. Bloquear invitado.
9. Consultar estadísticas.

### Riesgos técnicos

Especialmente:

- concurrencia
- seguridad
- QR
- generación de imágenes
- funcionamiento móvil
- conectividad
- recuperación ante errores.

---

# 19. Estrategia de implementación

Después del análisis, proponé un roadmap por fases.

Ejemplo:

### Fase 1
Eventos + invitados + base de datos.

### Fase 2
Invitaciones + QR.

### Fase 3
Scanner + check-in.

### Fase 4
Dashboard + estadísticas.

### Fase 5
Importación CSV/Excel.

### Fase 6
Roles y permisos.

### Fase 7
WhatsApp API.

Pero adaptá las fases al estado real del proyecto.

---

# 20. Regla importante

**No sobreingenierizar.**

La aplicación debe ser:

- simple
- rápida
- mantenible
- segura
- mobile-first para el control de acceso.

No agregues funcionalidades que no sean necesarias para el problema.

No implementes pagos, venta de entradas, marketplace, redes sociales, etc., salvo que el repositorio ya los tenga y sean necesarios.

El objetivo principal es:

> **Administrar eventos, administrar invitados, generar invitaciones digitales y controlar quién puede entrar al evento mediante un QR.**

---

## Primera tarea

**NO IMPLEMENTES TODAVÍA.**

Primero inspeccioná todo el repositorio y dame:

1. Resumen de lo que encontraste.
2. Arquitectura actual.
3. Tecnologías utilizadas.
4. Qué podemos reutilizar.
5. Qué falta construir.
6. Propuesta de arquitectura para esta funcionalidad.
7. Modelo de datos propuesto.
8. Roadmap de implementación.

Después de mi aprobación, comenzaremos la implementación por fases.