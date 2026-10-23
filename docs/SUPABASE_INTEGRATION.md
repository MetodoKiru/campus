# Integración de Supabase en el Campus Kiru

## Estado actual

- `public.profiles` vincula cada perfil con `auth.users`; los permisos deben comprobar el rol activo y el UUID autenticado.
- El inicio de sesión usa `/api/auth/login` para resolver el nombre de usuario y autenticar mediante Supabase Auth. El cliente comprueba después el perfil activo y el rol.
- `app/api/admin/users` administra cuentas reales mediante el cliente de servidor y la clave `service_role`, que nunca debe llegar al navegador.
- `kiru_app_records` guarda registros JSON bajo políticas RLS. `lib/kiru-records.ts` ofrece funciones de lectura/escritura que dependen de RLS.
- Los paneles de alumno y mentor consultan datos de Supabase. La persistencia debe validarse por flujo: cargar, modificar, recargar y volver a iniciar sesión.
- El temporizador de práctica guarda su estado como un registro de tipo `progress`. En la rama `feature/formador-role-foundation` se corrige la lectura desde el tipo de registro correcto y se evita que el intervalo de sincronización use valores obsoletos.
- El rol `formador`, su panel, API de candidaturas, sincronización con Google Sheets y ajuste de Calendly se están preparando en una rama aislada. La migración aún no se ha aplicado a producción y la integración no está aprobada para despliegue.

## Variables de entorno

Configurar solo en el servidor cuando corresponda:

- `NEXT_PUBLIC_SUPABASE_URL`: URL del proyecto Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: clave pública de Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: clave privada de servidor. Nunca usar el prefijo `NEXT_PUBLIC_`.
- `GOOGLE_CLIENT_EMAIL` y `GOOGLE_PRIVATE_KEY`: credenciales de la cuenta de servicio de Google para la integración de Sheets.
- `GOOGLE_SHEETS_SPREADSHEET_ID` y `GOOGLE_SHEETS_RANGE`: configuración de la hoja y rango. La integración tiene valores de compatibilidad con la hoja que usaba el prototipo, pero es preferible configurar estas variables explícitamente.

No copiar secretos al repositorio, a los componentes cliente, a las respuestas HTTP ni a los registros del navegador.

## Alta y administración de cuentas

1. Crear cuentas desde el panel administrativo/API protegida o mediante un procedimiento administrativo aprobado.
2. Confirmar que el usuario de Auth y la fila de `profiles` comparten el mismo UUID.
3. El rol debe estar en `app_metadata.kiru_role` y en `profiles.role`; los dos valores deben coincidir.
4. Para alumnos, verificar que existe la fila correspondiente en `public.students`.
5. Asignar mentores y tutores legales en `student_mentors` y `student_guardians`.
6. Probar acceso y políticas RLS con cuentas desechables de cada rol, incluidos intentos de acceso cruzado.

## Validación pendiente

- Probar inicio de sesión, roles, alta/edición/borrado y relaciones con cuentas desechables.
- Probar persistencia de flashcards, temporizador, avisos, documentos y pagos.
- Validar RLS para cada rol con usuarios independientes.
- Restaurar backups cifrados en un entorno aislado.
- Aplicar primero las migraciones del rol formador y de candidaturas en un entorno de prueba; comprobar credenciales y permisos de Google Sheets.
- Confirmar qué deployment de Vercel corresponde a la versión de producción antes de publicar cambios.

No se considera terminada una integración solo porque el código exista o un workflow de copia haya terminado; debe comprobarse el comportamiento real y la recuperación.
