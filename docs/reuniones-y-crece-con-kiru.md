# Reuniones con tu coordinador y Crece con Kiru

Dos apartados nuevos dentro del menú ☰ del mentor (no en la pantalla principal).

## Cuándo los ve el mentor

- Con la incorporación completa: certificado comprobado (en `kiru_mentor_onboarding` o en `kiru_mentor_steps`), «Nuestro Equipo» revisado y «Llamadas con las familias» leído. Es la misma regla del contador «3 de 3 pasos» del menú.
- O con una **autorización expresa de administración** (Administración → «Autorizaciones de mentores»). Exige motivo y guarda quién y cuándo; retirarla también queda registrado. **No marca ningún paso como completado**.
- La regla vive en la base (`kiru_private.mentor_can_grow`), así que las políticas RLS y las rutas del servidor dicen lo mismo. Ocultar el menú no es la única barrera.

## Reuniones

- El mentor indica días y franjas (y una nota) y los cambia cuando quiera: `kiru_mentor_availability`.
- El coordinador (Panel del Coordinador → «Reuniones de coordinación») ve la disponibilidad **solo de su grupo**, elige fecha y hora, pone el Zoom y la convoca. Una reunión al mes por coordinador (las canceladas no cuentan), 30 minutos. Nada se programa solo ni se conecta con calendarios.
- La convocatoria la envía el coordinador: botón «Enviar por correo» (abre su correo con los mentores en copia oculta) o «Copiar convocatoria».
- El mentor ve fecha, hora, duración, coordinador, enlace de Zoom y estado (Convocada, Realizada, Cancelada). Los borradores no los ve.
- Después, el coordinador marca la reunión como realizada, abre el registro de Jotform (https://form.jotform.com/263053244292049) y marca «Ya lo he enviado». El panel avisa si pasan 24 horas sin registro.
- La grabación de Zoom **no se guarda en el campus**: su enlace va en el registro de Jotform, que solo ve dirección.
- Administración ve todas las reuniones en solo lectura.

## Crece con Kiru

- Guía «Crecer en Kiru»: el PDF de dirección, tal cual, en `content/crecer-en-kiru/` (con sus páginas en imagen para leerla en el móvil). Se sirve por `/api/mentor/crece/guia` solo a mentores con acceso. Para cambiarla, sustituye esos archivos (y regenera las imágenes con `pdftoppm -png -r 150 crecer-en-kiru.pdf pagina`).
- Oportunidades (`kiru_opportunities`): las crea, edita, publica y cierra administración (Administración → «Crece con Kiru»). Sin publicadas, el mentor ve «Actualmente no hay oportunidades disponibles». La remuneración solo se enseña si se marca como autorizada.
- Candidaturas (`kiru_opportunity_applications`): una por mentor y oportunidad; la base rechaza duplicadas, cerradas, borradores y fuera de plazo. Estados: Enviada, En revisión, Entrevista o conversación, Aceptada, No seleccionada. Las cambia administración; el mentor las ve en «Mis candidaturas».
- Recomendaciones (`kiru_opportunity_recommendations`): el coordinador recomienda a mentores de su grupo (Panel del Coordinador → «Crece con Kiru»). No publica ni ve ni decide candidaturas.

## Permisos (RLS)

| | Mentor | Coordinador | Administración |
| --- | --- | --- | --- |
| Disponibilidad | la suya | la de su grupo | toda |
| Reuniones | convocadas de su grupo | las suyas (también borradores) | todas |
| Oportunidades | publicadas (+ cerradas a las que se presentó) | publicadas y cerradas | todas |
| Candidaturas | las suyas | ninguna | todas |
| Recomendaciones | ninguna | las suyas | todas |
| Autorizaciones | ninguna | ninguna | todas |

Nadie escribe en estas tablas desde el navegador: todo pasa por rutas del servidor que comprueban rol y grupo, y los disparadores de la base repiten las reglas importantes. Pruebas en `supabase/tests/rls_roles_test.sql`.
