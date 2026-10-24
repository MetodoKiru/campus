# Auditoría técnica de seguridad — Campus Kiru
Fecha: 23 de octubre de 2026

## Alcance revisado
- Repositorio: `MetodoKiru/campus-kiru`, rama `main`.
- Proyecto Supabase: `metodo kiru` (región eu-west-1).
- Tablas de la aplicación y políticas RLS; bucket de documentos.
- Configuración y documentación del workflow de copias de seguridad.
- Estado de los proyectos y permisos disponibles en Vercel.

## Corrección aplicada
La política SELECT de `public.kiru_flashcards` comprobaba únicamente que existiera el conjunto padre. Esa condición no expresaba por sí misma la relación autorizada entre usuario y alumno y podía permitir lecturas cruzadas si la política del conjunto padre cambiaba o se evaluaba de forma distinta a lo esperado.

Se sustituyó por una política explícita que permite leer las tarjetas solo al alumno titular, al administrador reconocido por `app_metadata.kiru_role`, al mentor asignado o al tutor familiar asignado. La migración SQL queda versionada en `supabase/migrations/20261023153000_restrict_flashcard_card_reads_to_related_users.sql`.

La migración se aplicó correctamente en Supabase. Esto confirma la ejecución del cambio de política, no una prueba completa de acceso con cuentas reales de cada rol.

## Estado verificado
- Las tablas públicas inspeccionadas tienen RLS activado.
- El bucket `kiru-documents` es privado, acepta PDF y limita cada archivo a 10 MiB.
- Supabase Security Advisor informa de que la protección contra contraseñas filtradas está desactivada. Debe habilitarse desde Auth/Security cuando se pueda comprobar la configuración de acceso.
- El workflow `.github/workflows/encrypted-db-backup.yml` crea copias lógicas cifradas con age, pero necesita los secretos `SUPABASE_DB_URL` y `BACKUP_AGE_RECIPIENT`, una ejecución correcta y una restauración de prueba para considerarse operativo.
- La documentación actual indica que el backup de PostgreSQL no incluye los binarios de Storage. La copia y recuperación independiente de los documentos siguen pendientes de verificación.
- No se pudo confirmar el último despliegue de Vercel: la API devolvió 403 al listar deployments. No se debe asumir que los cambios de GitHub están publicados.
- La aplicación contiene un flujo de inicio de sesión con Supabase Auth; la persistencia funcional completa de flashcards y temporizador todavía requiere pruebas de extremo a extremo.

## Pruebas pendientes antes de dar por cerrado el campus
1. Crear cuentas de prueba desechables de alumno, mentor, padre/tutor y administrador.
2. Verificar que cada rol solo puede leer tarjetas, documentos, pagos, avisos y registros autorizados; intentar expresamente acceder a los datos de otro alumno.
3. Probar alta, edición y borrado seguro de una cuenta de prueba, incluyendo pagos, aceptaciones de documentos, flashcards y archivos compartidos.
4. Confirmar la configuración de los secretos de backup, ejecutar el workflow y restaurar la copia cifrada en un entorno separado.
5. Respaldar un PDF de prueba de Storage y comprobar su recuperación.
6. Activar la protección contra contraseñas filtradas y volver a ejecutar Security Advisor.
7. Recuperar el acceso de inspección a Vercel, comprobar qué repositorio alimenta cada proyecto y validar un deployment de producción antes de declarar el campus publicado.
8. Probar la persistencia de flashcards y temporizador tras recargar, cerrar sesión y volver a entrar.

## Criterio de finalización
No declarar el campus listo para datos reales hasta completar las pruebas de aislamiento entre usuarios, recuperación de base de datos y Storage, y verificación del deployment. No usar cuentas ni datos reales para las pruebas destructivas.

## Adenda de seguimiento — 24 de octubre de 2026

### Cambios de seguridad completados en `main`
- Next.js y `eslint-config-next` se actualizaron a 16.4.3 en una PR separada.
- La auditoría posterior detectó una alerta alta adicional en Zod (<4.6.6). El lockfile se actualizó a 4.6.7 y la validación aislada de `npm ci`, `npm audit --audit-level=high` y build pasó antes de fusionar la PR.
- Se eliminó de `main` el script obsoleto `backup_kiru.sql`, que creaba un esquema antiguo y cuentas de ejemplo.

### Hallazgos nuevos / seguimiento
- El Security Advisor sigue marcando desactivada la protección contra contraseñas filtradas. No se dispone de una herramienta conectada para cambiar ese ajuste directamente; requiere revisión en Supabase Auth > Password Security.
- En una consulta de logs de Supabase de las últimas 24 horas aparecieron tres fallos de autenticación PostgreSQL para el usuario `postgres`, concentrados en un mismo segundo el 23 de octubre. La causa no está confirmada. Comprobar si coincide con un job de backup o una conexión mal configurada y revisar si hay nuevos intentos antes de concluir que existe actividad no autorizada.
- En la rama de trabajo se preparó una migración que sustituye comprobaciones RLS administrativas basadas solo en el JWT por una función que también valida que el perfil admin siga activo. Se probó en un PostgreSQL desechable, junto con las funciones atómicas de asignación de mentor y tutor. **No se ha aplicado a producción.**
- El flujo de borrado ahora prevalida referencias a pagos, documentos y flashcards, desactiva la cuenta antes de la limpieza y comunica qué paso falló. Sigue siendo multi-paso y no transaccional; no se debe dar por validado hasta probarlo con una cuenta desechable.
- La conexión de Vercel accesible muestra únicamente `metodo-kiru-14vn`, enlazado al repo `MetodoKiru/metodo-kiru`; no aparece un proyecto accesible enlazado a `MetodoKiru/campus-kiru`. Además, los checks de Campus Kiru han mostrado límites de builds del plan Hobby. La publicación del campus no está confirmada.

### Estado de las pruebas
- El validador de Inglés A1 en la rama pasa con 120 preguntas y cinco áreas, incluida Reading con pasajes. Listening y Writing siguen pendientes porque necesitan tipos de actividad y recursos adecuados.
- El workflow de PostgreSQL se ha generado correctamente y su archivo de dump se pudo listar; la restauración completa de base de datos y Storage sigue pendiente.
- Los cambios de formador/candidaturas y las nuevas migraciones siguen en una PR draft y no están habilitados en producción.

### Seguimiento de logs — 24 de octubre de 2026

Se volvió a consultar la ventana reciente de logs PostgreSQL. La búsqueda devuelve los mismos tres fallos de autenticación del usuario `postgres`, concentrados en torno a las 09:52:28–09:52:33 UTC del 23 de octubre, desde tres conexiones IPv6 cercanas entre sí. No aparecieron fallos más recientes en esa búsqueda. Esto no permite atribuir el origen con certeza ni demuestra por sí solo un acceso no autorizado. Próximo paso: comparar la hora con ejecuciones de backup/conexiones automatizadas y revisar de nuevo los logs tras esa comprobación; no rotar credenciales a ciegas sin más evidencia.

### Seguimiento de Storage — 24 de octubre de 2026

La consulta de solo lectura a `storage.objects` devuelve actualmente **0 objetos**. Esto confirma que la tabla está vacía en el momento de la consulta, pero no valida el proceso de copia ni de restauración. Antes de cerrar la prioridad de backups, comprobar si los documentos esperados se están guardando en otro bucket/proyecto y completar una restauración aislada si procede.
