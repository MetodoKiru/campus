# Revisión externa de Campus Kiru — Silvia / Cristina
Fecha: 23 de octubre de 2026

## Repositorios identificados
- Repositorio de trabajo de la organización: https://github.com/MetodoKiru/campus-kiru
- Repositorio de Silvia: https://github.com/silvia051206-droid/campus-kiru
- Rama revisada en el repositorio de Silvia: `main`
- Último commit revisado: `b71518d686eb5ab852c97fb2d1ae3dff4465c70c` (merge de Cristina, 22-10-2026).
- Commit anterior relevante: `83ff74c4e3fc25e5af9a7d25debdb098ff3c7e8b` (sincronización del panel de formador con Google Sheets, 22-10-2026).

## Cambios de Cristina identificados
1. `app/api/candidatos/route.js`: lee candidatos desde Google Sheets usando credenciales de servidor y variables de entorno.
2. `app/formador/candidato/[id]/page.js`: convierte la ficha de candidato para leer y actualizar información en Supabase, incluyendo observaciones y cambios de fase.
3. `app/api/nuevo-candidato/route.js`: inserta nuevos candidatos en Supabase.
4. `app/formador/page.js`: panel de formadores que consume la API de candidatos, sincroniza filas de Sheets a Supabase y permite configurar Calendly.
5. `app/mentor/page.tsx`: el merge más reciente elimina un alumno ficticio (Álvaro) del prototipo de mentor.

## Riesgos que impiden copiar estos cambios directamente
- El repositorio de Silvia tiene una estructura y un modelo de datos distintos del repositorio de la organización. El panel de administración de Silvia utiliza `localStorage` y contiene datos de ejemplo, roles y credenciales de demostración; no se debe trasladar como una sustitución directa del panel actual.
- `app/api/nuevo-candidato/route.js` construye un enlace con `https://https://...`, que está mal formado.
- El token de candidato se genera usando `Math.random()` y datos del nombre; no es adecuado como token de acceso seguro.
- La ruta de creación debe validar y limitar las entradas, protegerse frente a abuso y comprobar las políticas RLS de la tabla `candidatos`. La inserción con el cliente Supabase del navegador/servidor no debe asumirse autorizada sin revisar las políticas.
- El flujo de Google Sheets depende de secretos `GOOGLE_CLIENT_EMAIL` y `GOOGLE_PRIVATE_KEY`, y de un ID/rango de hoja específicos. No se debe copiar a producción sin verificar propiedad, permisos, columnas y necesidad actual.
- La pantalla de formador consulta y actualiza tablas `formadores` y `candidatos`, que no forman parte del esquema de tablas públicas que se ha inspeccionado en el proyecto Supabase de producción. Hace falta comprobar si pertenecen a otra base de datos/proyecto o si deben migrarse.
- Los cambios no se han integrado en el repositorio de la organización. Esta revisión es de solo lectura respecto al repositorio de Silvia.

## Recomendación de integración
No hacer merge ni copiar el panel completo. Primero separar la lógica de negocio útil (flujo de candidatos, sincronización con Sheets, fases, observaciones y Calendly) de la implementación prototipo; después adaptar el flujo al esquema, autenticación y RLS del campus de la organización. Preferir una rama y PR con cambios pequeños y pruebas, sin tocar producción hasta validar.

## Estado de las cuatro prioridades técnicas
1. Auditoría inicial de seguridad: realizada parcialmente; se corrigió la política SELECT de flashcards y se volvió a comprobar.
2. Pruebas con cuentas de los cuatro roles: pendientes; deben ejecutarse con cuentas de prueba aisladas y sin tocar usuarios reales.
3. Prueba real de eliminación de cuenta: pendiente; no ejecutar una eliminación destructiva en producción sin una cuenta desechable.
4. Copias de seguridad: ambos workflows ejecutaron correctamente el 23-10-2026 y generaron artefactos cifrados. El backup de Storage informó 0 archivos descargados y la consulta de `storage.objects` no devolvió objetos, por lo que el bucket parece estar vacío ahora. La restauración de PostgreSQL y de Storage sigue sin probarse; no considerar la recuperación validada.

## Pendientes de configuración
- Supabase Security Advisor sigue avisando de que la protección contra contraseñas filtradas está desactivada.
- La inspección de deployments de Vercel devolvió 403; no se ha confirmado qué versión está publicada.
- Para identificar otros cambios de Cristina, revisar commits adicionales de `ccrguezz` en el repositorio de Silvia y cualquier rama que no sea `main`.
