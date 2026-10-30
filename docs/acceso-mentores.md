# Acceso al campus desde el correo de bienvenida

Fecha: 30/10/2026. Paso 11 del «Flujo de un candidato» (incorporación): cuando
un mentor nuevo recibe el correo de bienvenida, ese correo ya lleva su usuario
y un botón «Crear mi PIN y entrar».

## Cómo funciona

1. El Apps Script de «Solicitud mentores» llama a `POST /api/mentores/acceso`
   con el nombre y el correo, protegido con la clave `KIRU_ALTA_SECRET`
   (Vercel + Propiedades del script).
2. El campus crea la ficha de incorporación y la cuenta de mentor si no
   existen (nunca duplica: se busca por correo), le pone usuario
   (`nombre.apellido`) y devuelve un enlace de un solo uso que vale 14 días.
3. El mentor abre el enlace (`/acceso#t=…`), ve su usuario, elige un PIN de 6
   números y entra directamente en `/mentor`.
4. A partir de ahí entra como todos: usuario + PIN en campus.metodokiru.es.

| Respuesta | Cuándo | Qué lleva |
| --- | --- | --- |
| `created` | Cuenta nueva | usuario + enlace |
| `link` | La cuenta existía pero el mentor nunca ha entrado | usuario + enlace nuevo (el anterior deja de valer) |
| `active` | El mentor ya ha entrado alguna vez | solo el usuario; con `newLink: true` también un enlace nuevo (PIN olvidado) |

Errores: 401 clave incorrecta, 409 si el correo es de una cuenta que no es de
mentor o está desactivada, 503 si falta la clave en Vercel.

## Seguridad

- El enlace va detrás de `#`, así que el navegador no lo manda al servidor y
  no queda en los registros de Vercel. En la base (`kiru_access_links`) solo se
  guarda su huella SHA-256; la tabla no tiene políticas RLS, solo la usa el
  servidor.
- Se gasta en una sola orden: dos pestañas a la vez no pueden usarlo dos veces.
- Hasta que el mentor pone su PIN, la cuenta tiene una contraseña larga al azar
  que nadie conoce.
- La cuenta nace **sin alumnos**. Como tiene ficha de incorporación sin
  certificado de delitos comprobado, la base de datos no deja asignarle alumno
  hasta que administración lo marque (panel «Incorporación de mentores»).
- PIN de 6 números; se rechazan 000000, 123456, 654321 y parecidos.

## Apps Script

Código en `docs/apps-script/acceso-campus-mentores.gs`, como un archivo más del
proyecto «Kiru filtro candidatos». Da tres cosas:

- `kiruAccesoParaCorreo(nombre, correo, telefono)`: para meter el bloque con el
  botón dentro del correo de bienvenida. Si el campus falla, devuelve un bloque
  vacío y el correo sale igual.
- Red de seguridad cada hora: en la pestaña «Incorporación», a quien tenga
  BIENVENIDA ENVIADA y ACCESO PLATAFORMA vacía le manda un correo corto con su
  acceso y rellena ACCESO PLATAFORMA. Así funciona aunque el correo de
  bienvenida no se haya tocado.
- Menú «Campus Kiru» → «Reenviar acceso a la fila seleccionada».

## Cambios en la base de datos

- `20261030090000_mentor_access_links.sql`: tabla `kiru_access_links`.
