# Campus Kiru: copias de seguridad y recuperación

## Estado y alcance

El workflow `.github/workflows/encrypted-db-backup.yml` intenta generar una copia lógica diaria de PostgreSQL, cifrarla con age y conservar el artefacto cifrado durante 90 días. También se puede lanzar manualmente desde GitHub Actions.

**No se considera operativo hasta que estén configurados los dos secretos, se complete una ejecución correcta y se haya probado la restauración.** No subir nunca claves privadas, contraseñas ni volcados sin cifrar al repositorio.

## Configuración inicial (una sola vez)

1. En un ordenador de confianza, instala `age` y genera un par de claves: `age-keygen -o kiru-backup-private-key.txt`.
2. Guarda `kiru-backup-private-key.txt` fuera de GitHub, en un lugar seguro y separado de la cuenta de GitHub. La clave pública aparece en la salida de `age-keygen` como `age1...`; solo esa clave pública se usa para cifrar.
3. En GitHub → Settings → Secrets and variables → Actions, crea:
   - `SUPABASE_DB_URL`: cadena de conexión PostgreSQL de Supabase con permiso suficiente para hacer el dump. Preferir conexión directa o Session Pooler compatible con `pg_dump`. No usar la clave anon ni service-role.
   - `BACKUP_AGE_RECIPIENT`: la clave pública `age1...` (nunca la privada).
4. Ejecuta manualmente **Encrypted database backup** desde Actions. Verifica que termina en verde y que produce un artefacto `*.dump.age` y su checksum.
5. Descarga el artefacto y prueba la restauración en una base de datos separada/no productiva usando la clave privada. No pruebes una restauración destructiva en producción.
6. Repite la prueba de restauración periódicamente y tras cambios importantes de esquema.

## Límites importantes

- El artefacto contiene un volcado lógico de PostgreSQL; **no incluye los archivos binarios de Supabase Storage**. Los PDF y demás objetos necesitan un segundo respaldo independiente. No borrar objetos de Storage confiando solo en este volcado.
- Los artefactos de GitHub duran 90 días y el workflow requiere que GitHub Actions esté habilitado. Para protección a largo plazo, copia los artefactos cifrados a un destino independiente (por ejemplo, almacenamiento privado con versionado/retención) y conserva la clave privada fuera de línea.
- Las copias diarias no sustituyen la recuperación a un punto en el tiempo (PITR). Su disponibilidad depende del plan y de la configuración del proyecto Supabase.
- Una copia no probada no es una garantía de recuperación. Registrar fecha, resultado y duración de las pruebas.

## Recuperación de emergencia

1. Detener cambios de escritura si es posible y comunicar la incidencia.
2. Identificar la copia válida más reciente y descargar el artefacto cifrado.
3. Descifrar en un equipo seguro: `age --decrypt -i kiru-backup-private-key.txt -o kiru-db.dump kiru-db.dump.age`.
4. Restaurar primero en una base de datos separada para comprobar integridad y versión. Para un dump custom de PostgreSQL, usar `pg_restore` y revisar roles/extensiones que deban recrearse.
5. Restaurar Storage desde su respaldo independiente, validar permisos/RLS, relaciones, documentos y flujos críticos antes de reabrir el servicio.

## Configuración obligatoria de GitHub Actions

En GitHub, abrir el repositorio `MetodoKiru/campus-kiru` → Settings → Secrets and variables → Actions → New repository secret. Crear:

- `SUPABASE_DB_URL`: cadena de conexión PostgreSQL del proyecto, obtenida en Supabase → Project Settings → Database → Connection string. Usar el formato URI compatible con `pg_dump`; si la contraseña contiene caracteres especiales, debe codificarse correctamente. No guardarla en archivos del repositorio.
- `BACKUP_AGE_RECIPIENT`: clave pública de `age` (empieza por `age1...`). La clave privada correspondiente debe guardarse fuera de GitHub, en un lugar seguro y separado de las copias.

Después, abrir Actions → Encrypted database backup → Run workflow. Confirmar que termina en verde y que adjunta el artefacto cifrado y su checksum. El workflow valida la estructura del dump antes de cifrarlo, pero esto no equivale a una prueba de restauración.

**Alcance actual:** este workflow respalda la base de datos PostgreSQL. No incluye los archivos binarios de Supabase Storage; estos necesitan una copia independiente. No considerar el plan completo hasta que Storage también esté respaldado y se haya probado una restauración en un entorno separado.

## Refuerzo aplicado en base de datos

Se añadieron índices para varias claves foráneas y consultas habituales de conjuntos de flashcards/registros. Las tablas públicas comprobadas tienen Row Level Security activado. El linter de Supabase aún informa de protección contra contraseñas filtradas desactivada y de oportunidades de optimización de políticas RLS; estas deben resolverse y probarse sin debilitar los permisos.
