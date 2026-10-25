# Rol de formador e incorporación de mentores

Fecha: 24/10/2026. Corresponde al paso 9 del «Flujo de un candidato»: lo que pasa
desde que un candidato queda seleccionado hasta que empieza con su alumno.
La selección (formulario, entrevistas, fases) sigue en el Apps Script de Drive.

## Qué puede hacer el formador

- Entrar al campus con usuario y PIN; el login le lleva a `/formador`.
- Añadir un mentor seleccionado (nombre, correo, teléfono).
- Marcar que ha firmado el acuerdo de confidencialidad.
- Marcar que ha comprobado el certificado de delitos de naturaleza sexual. El
  documento no se sube al campus: solo se guarda la fecha y quién lo comprobó.
- Crear la cuenta de mentor cuando las dos cosas anteriores están hechas. El
  PIN se genera al azar y se muestra una sola vez.
- Ver si el mentor ya ha entrado al campus y si tiene alumno asignado.

El formador **no** ve alumnos, familias, pagos, documentos ni registros. Lo
comprueban las pruebas de `supabase/tests/rls_roles_test.sql`.

## Qué hace administración

- Crea cuentas de formador desde el panel de admin (rol «Formador/a»).
- Puede abrir el mismo panel desde el botón «Incorporación de mentores».
- Asigna el alumno al mentor, como siempre. Si el mentor tiene ficha de
  incorporación y el certificado no está comprobado, la base de datos lo rechaza.
  Los mentores que ya existían antes de este cambio no tienen ficha y no cambian.

## Cambios en la base de datos

- `20261024150000_fix_assignment_policy_recursion.sql`: arregla el error
  «infinite recursion detected in policy» que impedía asignar mentor o familia
  desde el panel de admin.
- `20261024160000_formador_role_and_mentor_onboarding.sql`: rol `formador`,
  tabla `kiru_mentor_onboarding` con RLS y bloqueo de asignación sin certificado.

Para probarlas en local: `PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres supabase/tests/run.sh`.
Se aplican en producción solo con el visto bueno de Sofía.

## De dónde sale

Se ha revisado la rama `feature/formador-role-foundation` (Cristina). Se
aprovecha la idea de comprobar el rol en el servidor (perfil activo y rol igual
en `profiles` y en el JWT) y el enrutado del login. No se trae el pipeline de
candidatos ni la sincronización con Google Sheets, porque duplicaría el Apps
Script, ni las migraciones de RLS de esa rama, que chocan con la de main del
24/10.

## Pendiente

- Correo «crea tu contraseña»: necesita configurar un SMTP propio en Supabase
  (el de serie solo permite unos pocos correos por hora) y una página para fijar
  el PIN. Hasta entonces el formador entrega el PIN en mano.
- Fichas para los mentores actuales, si se quiere que el bloqueo les aplique.
