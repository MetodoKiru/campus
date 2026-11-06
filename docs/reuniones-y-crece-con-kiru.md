# Reuniones con tu coordinador y Crece con Kiru

Dos apartados nuevos dentro del menú ☰ del mentor (no en la pantalla principal).

## Cuándo los ve el mentor

- Con la incorporación completa: certificado comprobado (en `kiru_mentor_onboarding` o en `kiru_mentor_steps`), «Nuestro Equipo» revisado y «Llamadas con las familias» leído. Es la misma regla del contador «3 de 3 pasos» del menú.
- O con una **autorización expresa de administración** (Administración → «Autorizaciones de mentores»). Exige motivo y guarda quién y cuándo; retirarla también queda registrado. **No marca ningún paso como completado**.
- La regla vive en la base (`kiru_private.mentor_can_grow`), así que las políticas RLS y las rutas del servidor dicen lo mismo. Ocultar el menú no es la única barrera.

## Reuniones

Todo con herramientas gratuitas: Campus, Zoom gratuito, Calendly Free (opcional), Google Calendar y Google Drive. Sin APIs propias, Zapier ni Make.

- **Disponibilidad en cuadrícula de 30 minutos** (lunes a domingo, 08:00–22:00), igual para mentores y coordinadores: `kiru_mentor_availability.cells` («día-HH:MM»). Se marca casilla a casilla; el día o la hora marcan la columna o la fila entera. Las columnas antiguas `days`/`slots` se conservan, pero el campus ya no las usa.
- **Compromiso, sin puntuación**: el coordinador ve si cada mentor la ha completado, cuántas medias horas marcó, cuándo la actualizó y si respondió a su última petición en plazo. Peticiones con fecha límite: `kiru_availability_requests`; la primera respuesta de cada mentor: `kiru_availability_responses` (se anota sola al guardar la cuadrícula).
- **Coincidencias**: se cruzan las horas del coordinador con las de su grupo y se ordenan de más a menos mentores (con %, quién puede, quién no y si es obligatoria para él). «Elegir este horario» rellena la próxima fecha de ese día y hora; decide el coordinador.
- **Convocatoria**: el coordinador crea la reunión en Zoom (o la reserva en su Calendly Free con Zoom conectado) y pega el enlace una vez. Al convocarla, los mentores la ven en su menú ☰. Invitación por correo: «Invitar con Google Calendar» (evento ya rellenado con los mentores como invitados; Google manda las invitaciones) o «Enviar por correo» (copia oculta) o «Copiar convocatoria».
- **Aviso de grabación** visible en el panel y en cada reunión convocada, con el procedimiento de grabación local de Zoom gratuito.
- **Después**: comprobar la grabación, subirla a la carpeta de Drive de Método Kiru, registrar el enlace (se guarda en `kiru_coordination_meeting_private`, que solo leen el coordinador de la reunión y administración) y completar el Jotform (https://form.jotform.com/263053244292049) en 24 horas.
- Una reunión al mes por coordinador, 30 minutos, empezando en punto o y media. Administración lo ve todo en solo lectura.

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
