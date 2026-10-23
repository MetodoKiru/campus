# Estado de prioridades técnicas — Campus Kiru

Fecha: 23 de octubre de 2026. Repositorio oficial: `MetodoKiru/campus-kiru`.

## Prioridades acordadas

1. **Inicio de sesión con Supabase Auth.** La ruta de acceso utiliza Supabase Auth y valida el perfil activo y su rol. Falta una prueba real end-to-end por rol y revisar la recuperación de acceso.
2. **Administración de cuentas reales.** Las rutas permiten crear, consultar, editar y eliminar cuentas mediante Supabase Auth y `profiles`. Se han mejorado en esta rama los errores al comprobar nombres duplicados y las salvaguardas al cambiar roles. Falta probar todas las operaciones con cuentas desechables.
3. **Roles y redirección.** El Campus admite alumno, mentor, padre y administrador. Esta rama añade el rol formador a la interfaz administrativa y al inicio de sesión, con una migración pendiente. No se ha aplicado la migración a producción ni se ha desplegado esta rama.
4. **RLS y permisos.** La política de lectura de flashcards está corregida y versionada. Falta probar los cuatro roles existentes y el futuro rol formador con cuentas independientes y pruebas de acceso cruzado.
5. **Vinculaciones.** Existen tablas `student_mentors` y `student_guardians`; las tablas de producción inspeccionadas estaban vacías en esas relaciones. Falta probar asignación, lectura y aislamiento de cada vínculo.
6. **Paneles y persistencia.** Los paneles principales leen/escriben en Supabase en varias áreas, pero falta una prueba completa de persistencia de flashcards, temporizador, avisos, documentos y pagos. No asumir que todo el estado de interfaz se persiste correctamente.
7. **Despliegue final.** Vercel muestra estados de preview asociados a commits de esta rama, pero falta confirmar el deployment de producción y el commit publicado. No se ha desplegado este cambio a producción.

## Cambios aislados en esta rama

- Se añadió el rol `formador` a los tipos y opciones de administración.
- El login dirige las cuentas con ese rol a `/formador`.
- Se añadió una migración versionada para ampliar la restricción del rol en `profiles`.
- Se preparó un panel protegido, API de candidaturas con comprobación de sesión/rol en servidor, sincronización con Google Sheets, API de detalle y ajustes de Calendly. La migración del esquema y los secretos de Google aún no se han aplicado/validado en un entorno de prueba, por lo que no debe considerarse listo para producción.
- Se añadió una salvaguarda para evitar cambiar el propio rol desde la sesión administrativa o degradar al último administrador activo.
- Se documentó feedback técnico constructivo sobre el panel y la integración con Sheets.

## Pendiente antes de integrar

- Ejecutar build/lint y resolver cualquier fallo.
- Aplicar la migración primero en un entorno de prueba y verificar que los cuatro roles existentes siguen funcionando.
- Aplicar y validar la migración de candidaturas/Calendly en un entorno de prueba; verificar variables de Google, permisos de la hoja, sincronización, detalle, historial y transiciones.
- Probar las operaciones de cuentas, relaciones y persistencia con datos desechables.
- Validar la recuperación de backups en un entorno aislado.
- Confirmar la versión desplegada y solo entonces valorar la integración en `main`.

**Importante:** esta rama es una propuesta de trabajo. No se ha aplicado la migración del rol formador a producción ni se ha desplegado la rama a producción.


## Hallazgos adicionales de la última revisión
- Supabase Performance Advisor informa **36 avisos `auth_rls_initplan`** por llamadas a `auth.uid()`/`auth.jwt()` que podrían optimizarse en políticas RLS. No se han modificado estas políticas en producción; se requiere agruparlas, revisar la semántica y probar antes de aplicar una migración.
- `kiru_app_records` tiene dos índices únicos redundantes sobre `(owner_id, record_type, record_key)`. No afectan a la integridad, pero añaden trabajo a las escrituras; revisar una limpieza controlada en una migración futura.
- Supabase Security Advisor mantiene el aviso de protección de contraseñas filtradas desactivada. Las herramientas disponibles permiten consultar el aviso, pero no cambiar esa opción de Auth.

- El nuevo portal de candidaturas genera enlaces independientes con tokens aleatorios de 256 bits y guarda solo el hash. Al desplegarlo, los enlaces antiguos de token corto deberán renovarse y distribuirse de nuevo; no se deben tratar como compatibles automáticamente.

- La revisión de políticas también detecta que varias reglas administrativas se basan directamente en `app_metadata.kiru_role = admin` sin comprobar `profiles.is_active`. La API de administración sí comprueba el estado activo, pero el acceso directo a tablas por RLS debe endurecerse en una migración separada y probada; no se ha cambiado producción.
- En la inspección de datos, las tablas de relación de mentoría/familia y los registros persistentes consultados no tenían relaciones/registros de prueba suficientes para validar los flujos reales. No se deben inventar asignaciones; hace falta una cuenta de prueba y relaciones desechables.

- La revisión de esquema confirma que `student_mentors` tiene una restricción única por pareja alumno-mentor, no por alumno. Por eso se añadió una función RPC transaccional para sustituir la asignación del alumno de forma atómica y validar los roles en la base de datos; falta probarla en un entorno de desarrollo.
- Los últimos checks de Vercel muestran `build-rate-limit`; no equivalen a un error confirmado del código, pero impiden validar el preview. El workflow de GitHub aparece como fallido sin jobs/logs recuperables mediante la integración actual. La compilación sigue pendiente de validación efectiva.
