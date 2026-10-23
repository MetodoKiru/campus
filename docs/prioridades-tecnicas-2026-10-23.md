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
- El panel de formadores se dejó en una pantalla protegida y sin datos de candidaturas hasta que la API de Sheets y el modelo de datos superen las pruebas. Esto evita exponer candidaturas mientras la conexión no esté lista.
- Se añadió una salvaguarda para evitar cambiar el propio rol desde la sesión administrativa o degradar al último administrador activo.
- Se documentó feedback técnico constructivo sobre el panel y la integración con Sheets.

## Pendiente antes de integrar

- Ejecutar build/lint y resolver cualquier fallo.
- Aplicar la migración primero en un entorno de prueba y verificar que los cuatro roles existentes siguen funcionando.
- Terminar API, tablas, RLS y sincronización de Google Sheets.
- Probar las operaciones de cuentas, relaciones y persistencia con datos desechables.
- Validar la recuperación de backups en un entorno aislado.
- Confirmar la versión desplegada y solo entonces valorar la integración en `main`.

**Importante:** esta rama es una propuesta de trabajo. No se ha aplicado la migración del rol formador a producción ni se ha desplegado la rama a producción.
