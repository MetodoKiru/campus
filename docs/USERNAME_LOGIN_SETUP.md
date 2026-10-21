# Acceso con usuario y contraseña — preparación

La interfaz actual todavía contiene cuentas de demostración en localStorage. No desactivar esas cuentas hasta haber creado y probado cuentas reales.

## Cambios preparados
- Migración SQL: añade `profiles.username` con índice único sin distinguir mayúsculas.
- Endpoint `POST /api/auth/login`: busca el usuario en el servidor, comprueba la contraseña mediante Supabase Auth y devuelve la sesión solo tras autenticar correctamente.
- La clave `SUPABASE_SERVICE_ROLE_KEY` se usa exclusivamente en servidor; jamás debe tener prefijo `NEXT_PUBLIC_`, publicarse en GitHub ni enviarse al navegador.

## Requisitos antes de activar el endpoint
1. Ejecutar la migración SQL en Supabase.
2. Añadir `SUPABASE_SERVICE_ROLE_KEY` en Vercel para Production, Preview y Development. No compartir la clave en el chat.
3. Crear una cuenta de Supabase Auth por persona, asociar su UUID en `profiles`, rellenar `username` y asignar el rol correcto. No guardar contraseñas en `profiles` ni en localStorage.
4. Probar cada rol y las políticas RLS antes de retirar el acceso de demostración.

La recuperación de contraseña se deja para una fase posterior, como se ha acordado.
