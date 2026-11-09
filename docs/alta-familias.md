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
4. El script manda a cada tutor su usuario y su botón. El botón del alumno va
   en el correo del primer tutor, porque el alumno no tiene correo.
5. A metodokiru@gmail.com le llega un resumen; si falta el correo de un tutor,
   lleva un botón de WhatsApp con el mensaje escrito para pedírselo. Al escribir
   el correo en la hoja, la siguiente pasada crea esa cuenta y le manda el acceso.

## Nunca duplica

- El alumno se recuerda por el número de envío del formulario en
  `kiru_family_intakes` (solo el número y el id del alumno; nada del formulario).
- Si un tutor ya tenía cuenta de familia y un alumno con el mismo nombre (alta a
  mano), se reutiliza ese alumno.
- Los tutores se buscan por correo. Un correo que ya es de un mentor u otro rol
  no se toca: sale como error en el resumen.

| Estado (tutor o alumno) | Qué significa |
| --- | --- |
| `created` | Cuenta nueva + enlace |
| `link` | Ya existía, nunca ha entrado, se acaba de enlazar → enlace nuevo |
| `active` | Ya existía y ya ha entrado → solo se le avisa |
| `already` | Hecho en una llamada anterior → nada |
| `error` | No se pudo (texto en `error`) |

## Protección de datos del menor

- Sin la autorización de la familia no se crea ninguna cuenta.
- La cuenta del alumno solo tiene nombre y usuario; su correo es interno
  (`@alumnos.campus-kiru.invalid`) y nunca recibe nada.
- `kiru_family_intakes` tiene RLS sin políticas: solo la lee el servidor.

## Panel de administración

Un alumno puede tener padre y madre. «Añadir a la familia» ya no quita al tutor
que estaba; «Quitar» quita solo al tutor elegido (o a toda la familia si no hay
ninguno elegido de los enlazados).
