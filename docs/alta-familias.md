# Alta automática de familias en el campus

Fecha: 09/11/2026. Cuando una familia rellena el formulario de incorporación
(Jotform → pestaña FAMILIAS de «Familias Kiru (respuestas)»), en 10 minutos
tiene sus cuentas del campus y su correo de acceso, sin que nadie de Método
Kiru haga nada.

## Cómo funciona

1. El Apps Script `docs/apps-script/alta-familias.gs` (proyecto «Kiru filtro
   candidatos») mira cada 10 minutos las filas con la columna CAMPUS ALTA vacía.
2. Si la familia marcó «Autorización para crear una cuenta en la Plataforma
   Kiru», llama a `POST /api/familias/alta` (clave `KIRU_ALTA_SECRET`) con el
   número de envío, el nombre del alumno y los tutores que han dado correo.
3. El campus crea (o reutiliza) la cuenta del alumno y una cuenta de familia
   por tutor, las enlaza en `student_guardians` y devuelve los enlaces «Crea tu
   PIN» de un solo uso (14 días), los mismos que usan los mentores (`/acceso`).
4. El script manda a cada tutor su usuario y su botón. El alumno no tiene
   correo y tiene una sola cuenta con un solo PIN: el mismo botón para crearlo
   va a todos los tutores enlazados a los que se escribe, y basta con usarlo una
   vez. Un tutor que llega después (alta parcial o reintento) recibe el usuario
   del alumno y a quién se le mandó el botón, sin anular el enlace del otro.
5. A metodokiru@gmail.com le llega un resumen; si falta el correo de un tutor,
   lleva un botón de WhatsApp con el mensaje escrito para pedírselo. Al escribir
   el correo en la hoja, la siguiente pasada crea esa cuenta y le manda el acceso.

## Nunca duplica ni adivina

- El alumno se recuerda por el número de envío del formulario en
  `kiru_family_intakes` (solo el número y el id del alumno; nada del formulario).
- **Nunca se reutiliza un alumno por el nombre.** Si ya hay en el campus un
  alumno con el mismo nombre (aunque sea hijo del mismo tutor), el campus
  responde `review` y no crea nada. La fila queda en REVISIÓN MANUAL; Sofía
  escribe en CAMPUS ID ALUMNO el id de ese alumno (es el mismo) o NUEVO (es otro).
- Los tutores se buscan por correo. Un correo que ya es de un mentor u otro rol
  no se toca: sale como error y no bloquea al otro tutor.

| Estado (tutor o alumno) | Qué significa |
| --- | --- |
| `created` | Cuenta nueva + enlace «Crea tu PIN» |
| `linked` | Ya tenía cuenta de familia; se enlaza con el alumno, sin enlace nuevo |
| `already` | Hecho en una llamada anterior → nada |
| `resent` | Enlace nuevo porque su correo venía en `resendTo` |
| `error` | No se pudo (texto en `error`) |

## Cada envío por separado, cada enlace una sola vez

- El alumno tiene una sola cuenta, un solo usuario y un solo PIN. Su enlace
  «Crea tu PIN» se genera una vez y ese mismo enlace va a todos sus tutores
  enlazados con correo válido. El correo explica que basta con usarlo una vez.
- El script apunta cada correo que sale bien en el momento y guarda cada enlace
  (Propiedades del script, `altaFamEnv|nº de envío`) hasta entregarlo. Si Gmail
  falla, el reintento manda el mismo enlace: no pide otro al campus ni anula el
  que ya tiene el otro tutor. Tras 3 intentos para y pide REENVIAR.
- Un tutor que llega después (alta parcial) recibe el mismo enlace del alumno si
  aún no se ha usado; si el alumno ya tiene PIN, solo su usuario.
- A quien ya recibió todo no se le vuelve a escribir. Un tutor que ya tenía
  cuenta recibe un único correo: el aviso del nuevo alumno con su acceso.
- Solo REENVIAR (escrito por Sofía) genera enlaces nuevos, y entonces los
  anteriores sin usar dejan de valer.

## Estados en la hoja (columna CAMPUS ALTA)

- `PENDIENTE · falta …`: falta el nombre del alumno o un correo válido. No se crea nada.
- `SIN AUTORIZACIÓN`: la familia no autorizó crear la cuenta. No se crea nada.
- `REVISIÓN MANUAL · …`: ya hay un alumno con ese nombre. No se crea nada.
- `CUENTAS CREADAS · reintentando …` / `… no se ha podido enviar …`: un correo no salió.
- `ALTA PARCIAL · acceso enviado a … · PENDIENTE correo de …`: alumno y un tutor
  dados de alta; al escribir el correo que falta se completa sola.
- `ACCESO ENVIADO`: todo hecho.
- `CUENTA ENLAZADA · aviso enviado`: los tutores ya tenían acceso.
- `ERROR · …`: error del campus tras 3 intentos. Vaciar la casilla para reintentar.

**Alumno activo** es otra cosa: el alta no asigna mentor, horario, clases ni
pagos. El alumno se activa como hasta ahora, con «Activa» en la pestaña
Familias de Contabilidad (usa el CAMPUS ID ALUMNO) y asignándole mentor y horario.

## Pruebas

`npm test` (Node 24, 25 pruebas): `tests/family-intake.test.mjs` prueba la lógica del
campus y `tests/alta-familias-script.test.mjs` ejecuta el Apps Script con una
hoja, un Gmail y unas propiedades falsos contra esa misma lógica (fallos de
Gmail, nombres repetidos, alta parcial, datos que faltan, tutor duplicado).

## Protección de datos del menor

- Sin la autorización de la familia no se crea ninguna cuenta.
- La cuenta del alumno solo tiene nombre y usuario; su correo es interno
  (`@alumnos.campus-kiru.invalid`) y nunca recibe nada.
- `kiru_family_intakes` tiene RLS sin políticas: solo la lee el servidor.

## Panel de administración

Un alumno puede tener padre y madre. «Añadir a la familia» ya no quita al tutor
que estaba; «Quitar» quita solo al tutor elegido (o a toda la familia si no hay
ninguno elegido de los enlazados).
