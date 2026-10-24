# Campus Kiru

Campus online de Método Kiru para alumnos, mentores, familias y administración.

## Stack

- **Next.js 16 + React 19**, desplegado en Vercel.
- **Supabase** (región eu-west-1): Postgres con RLS, Auth y Storage (bucket privado `kiru-documents`).

## Estructura

| Ruta | Para qué |
| --- | --- |
| `app/admin`, `app/alumno`, `app/mentor`, `app/padre` | Área de cada rol |
| `app/api/auth/login` | Login con usuario + PIN (resuelve el email en servidor) |
| `app/api/admin/users` | Alta, edición y borrado de cuentas (solo admin, usa la service role) |
| `app/api/admin/bootstrap` | Crea el primer admin; desactivado en cuanto existe uno |
| `lib/` | Cliente de Supabase y acceso a datos |
| `supabase/migrations/` | Historial completo del esquema y las políticas RLS |
| `supabase/tests/` | Pruebas de aislamiento entre roles |
| `docs/` | Auditorías, copias de seguridad y guías de configuración |

## Seguridad

- Toda la autorización vive en las políticas RLS de Supabase. El rol válido es el que coincide en `profiles.role` y en `app_metadata.kiru_role`; una cuenta con `is_active = false` pierde el acceso.
- La clave `SUPABASE_SERVICE_ROLE_KEY` solo se usa en `app/api/*`. Nunca en variables `NEXT_PUBLIC_*`.
- Las cabeceras de seguridad (CSP, HSTS, etc.) están en `next.config.ts`.

## Desarrollo

```bash
npm ci
npm run dev
```

Variables necesarias: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y, para las rutas de servidor, `SUPABASE_SERVICE_ROLE_KEY`.

## Cambios en la base de datos

1. Crea un archivo nuevo en `supabase/migrations/` (`AAAAMMDDHHMMSS_descripcion.sql`). No cambies la base desde el SQL Editor sin guardar la migración.
2. Ejecuta las pruebas de RLS contra un Postgres local (nunca contra producción):
   ```bash
   PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres supabase/tests/run.sh
   ```
3. CI repite esas pruebas en cada PR.

`20261021160000_reconstructed_kiru_content_tables.sql` reconstruye tablas que se crearon fuera del historial; en producción ya existen (ver el comentario del archivo).
