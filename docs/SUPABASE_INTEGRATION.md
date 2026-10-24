# Integración de Supabase en el Campus Kiru

## Estado
- La tabla `profiles` vincula cada perfil con `auth.users`.
- El rol privilegiado debe establecerse desde `app_metadata.kiru_role`, nunca desde `user_metadata` editable por el usuario.
- `kiru_app_records` permite guardar registros JSON tipados bajo las políticas RLS existentes.
- `lib/kiru-records.ts` contiene las funciones para leer, guardar y eliminar registros (las políticas RLS deciden qué puede hacer cada rol).
- La pantalla de acceso existente aún usa usuarios de demostración/localStorage. No se ha sustituido deliberadamente hasta crear y verificar cuentas reales para evitar bloquear el acceso al campus.

## Variables de entorno
En Vercel, proyecto `campus-kiru-vrwu`, configurar para Production, Preview y Development:
- `NEXT_PUBLIC_SUPABASE_URL`: URL del proyecto Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: clave publicable/anon de Supabase.

No poner nunca la clave `service_role` en una variable `NEXT_PUBLIC_*`, en el navegador ni en el repositorio.

## Alta inicial de cuentas
1. Crear cada usuario en Supabase Auth con su correo y contraseña temporal.
2. Crear/vincular su fila en `public.profiles` con el mismo UUID que `auth.users.id`.
3. Asignar rol privilegiado mediante el mecanismo administrativo seguro; no confiar en metadatos editables desde el cliente.
4. Para alumnos, verificar que existe la fila correspondiente en `public.students`.
5. Asignar mentores y tutores legales en `student_mentors` y `student_guardians`.
6. Probar inicio de sesión y comprobar las políticas RLS con cuentas de cada rol antes de retirar las cuentas de demostración.

## Siguiente fase de integración
- Sustituir el login de demostración por `signInKiru` cuando existan cuentas reales y se haya verificado la configuración de entorno.
- Reemplazar gradualmente las claves de localStorage por `saveKiruRecord`/ `listKiruRecords`, usando el UUID de perfil autenticado como `ownerId`.
- No migrar documentos PDF en Base64 a `jsonb`; usar Supabase Storage con políticas de acceso y guardar únicamente la ruta del objeto en los registros.
- No desplegar la integración completa hasta probar la separación de datos entre alumno, mentor, familia y administración.
