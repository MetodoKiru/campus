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
