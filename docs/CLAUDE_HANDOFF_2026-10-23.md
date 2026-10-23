# Handoff para la siguiente sesión de Claude — Campus Kiru

**Fecha:** 23 de octubre de 2026  
**Repositorio oficial:** `MetodoKiru/campus-kiru`  
**PR de trabajo:** https://github.com/MetodoKiru/campus-kiru/pull/2  
**Rama:** `feature/formador-role-foundation`  
**Estado:** draft; no fusionar ni aplicar migraciones a producción todavía.

## Instrucción principal

Continúa desde el estado actual del repositorio y de la PR. No empieces de cero y no priorices el rol formador antes de seguridad, pruebas de roles, eliminación y restauración. Aprovecha el trabajo de Cristina como referencia para candidatos, fases, notas, historial, Google Sheets y Calendly, pero adapta su lógica al esquema y a la seguridad de Campus Kiru. El documento de feedback es un borrador para revisión de la propietaria; no enviarlo automáticamente.

## Avances confirmados

- La política de lectura de flashcards se corrigió y versionó en `main`.
- La rama añade controles a la API de cuentas: sesión/rol activo, comprobación de duplicados, protección contra cambios de rol propios y contra degradar al último admin. También se corrigió el cierre de sesión de alumno, mentor, padre y admin para llamar a `supabase.auth.signOut()` antes de volver al login; formador ya tenía logout real.
- Se ha mejorado el guardado concurrente de registros y la lectura del temporizador.
- Las asignaciones de mentor y tutor se prepararon como RPC atómicas con validación de roles.
- Se añadió una migración para endurecer las políticas RLS de relaciones frente a administradores desactivados.
- Se generó un backup cifrado de PostgreSQL y se pudo inspeccionar su lista de contenido; la restauración completa sigue sin probarse.
- El workflow de Storage informó 0 archivos; confirmar si el almacenamiento está vacío y probar recuperación.
- El motor A1 de Inglés en la rama contiene 100 preguntas en cinco unidades. Se añadió un validador automático. Un workflow anterior falló porque el merge commit probado contenía 101 preguntas. El validador ya pasa en el head `c89d85554bb41440b301d56d61b3137e9105ef54`: 100 preguntas, cinco unidades y tres categorías.
- Existe el borrador de feedback constructivo en `docs/feedback-tecnico-panel-formador.md`.
- El panel formador y portal de candidaturas están aislados en la rama. Los tokens del nuevo portal son aleatorios de 256 bits y se almacena solo el hash. Los enlaces antiguos deberán renovarse si se aprueba el lanzamiento.
- El CI de GitHub Actions ha pasado en el head `c37eaa8cb35d9c8918df9a2ac1a24bed142f8921` (run `39972660842`): instalación, auditoría, validador de Inglés, lint específico y build de producción, incluidos los cambios de logout. `npm ci` informa 0 vulnerabilidades tras actualizar el lockfile. Los checks de Vercel para el head actual siguen bloqueados por `build-rate-limit`; un preview anterior sí aparece en verde. La producción identificada sigue en `main`, SHA `5816d33ba34adbb14341b8e0015eef937f6b168d`.

## Orden obligatorio

### P0 — Seguridad, login y permisos
1. El CI ya pasó en el head `c37eaa8cb35d9c8918df9a2ac1a24bed142f8921` (run `39972660842`). Repetirlo después de futuros cambios y ejecutar pruebas de sesión end-to-end.
2. Probar con cuentas desechables los cuatro roles actuales: login, redirección, sesión caducada, perfil inactivo y acceso cruzado.
3. Supabase Security Advisor marca desactivada la protección de contraseñas filtradas. Si no se puede activar con herramientas, dar a la propietaria los pasos exactos desde Supabase.
4. Revisar RLS de tablas y Storage; no aplicar migraciones en producción.
5. Confirmar que `npm audit` sigue dando 0 vulnerabilidades en el head actual y revisar el aviso de paquete `eslint` obsoleto. Un run anterior encontró cinco vulnerabilidades (4 altas, 1 crítica) antes de actualizar el lockfile; no usar `npm audit fix --force` sin revisar incompatibilidades.

### P1 — Eliminación segura de cuentas
6. Auditar DELETE en `app/api/admin/users/route.ts`. La limpieza de tablas y Storage es secuencial y no transaccional; un fallo puede dejar limpieza parcial. Diseñar estrategia transaccional/recuperable y probar con una cuenta desechable. No borrar usuarios reales.
7. Confirmar el tratamiento del historial de pagos, documentos, aceptaciones, flashcards, avisos, relaciones y Storage. Preservar trazabilidad económica y registros creados por otros usuarios.
8. Verificar que la UI no afirma que se eliminó la cuenta cuando solo se completó parte de la limpieza.

### P2 — Backups y restauración
9. Localizar artefactos cifrados y documentar cómo descifrarlos con la clave disponible, sin publicar secretos.
10. Restaurar PostgreSQL en un entorno aislado y comprobar esquema, constraints, RLS y datos.
11. Confirmar si Storage no tiene objetos; si hay artefactos, restaurar en un bucket/entorno aislado y comprobar rutas y permisos.
12. No declarar el backup validado hasta probar una restauración.

### P3 — Inglés
13. El validador ya pasa en el head `c89d85554bb41440b301d56d61b3137e9105ef54` (100 preguntas, cinco unidades y tres categorías). Repetirlo tras cualquier cambio.
14. Ampliar a siete áreas: **Grammar, Use of English, Vocabulary, Reading, Listening, Writing y Everyday English**, sin eliminar Everyday English.
15. No fingir Listening/Writing como opción múltiple. Diseñar tipos reales: lectura con preguntas, audio reproducible y respuesta libre con feedback; definir contenidos/archivos y derechos de uso.
16. Mantener filtros de unidad, dificultad y cantidad; comprobar asignación por mentor, finalización por alumno, feedback y persistencia en Supabase.
17. Añadir tests de estructura, IDs, categorías, opciones/respuestas, asignación y persistencia.

### P4 — Diseño y administración
18. Unificar navegación, tipografía, espaciado, estados de carga y mensajes de mentor, familia y admin.
19. Revisar la previsualización del administrador y retirar el botón de seis usuarios si sigue presente.
20. Se corrigió logout de Supabase en alumno, mentor, padre y admin en esta rama (formador ya lo hacía). Falta probar sesiones reales desechables. Retirar datos demo y verificar que no quedan alumnos ficticios.
21. Confirmar que los formularios reflejan el estado realmente guardado en Supabase.

### P5 — Despliegue
22. Producción identificada en `main`, SHA `5816d33ba34adbb14341b8e0015eef937f6b168d`. Confirmar que sigue siendo el deployment activo y revisar su runtime; no confundir previews con producción.
23. Revisar logs/runtime y variables de entorno sin exponer secretos.
24. Build de producción, TypeScript, lint específico y test de Inglés ya pasan en CI run `39972660842`; el check de Vercel del head actual sigue bloqueado por `build-rate-limit`. Completar pruebas de roles en staging y confirmar preview funcional; después proponer integración a `main`.

### P6 — Formador y Cristina
25. Solo después de P0–P5, revisar la PR del formador.
26. Probar migraciones, permisos, sincronización idempotente con Sheets, duplicados, fallos de Google, notas/historial, fases, Calendly y portal con datos ficticios aislados.
27. Preparar renovación de enlaces antiguos y revisar el documento de feedback antes de que la propietaria decida enviarlo.
28. No fusionar ni desplegar sin autorización explícita y pruebas.

## Bloqueos que requieren a la propietaria

- No crear una rama de base de datos Supabase si aparece un coste sin informarlo y obtener autorización.
- Usar cuentas desechables para pruebas; no tocar usuarios reales.
- Si faltan artefactos o la clave de descifrado, pedir el acceso mínimo necesario; nunca subir claves a GitHub.
- No modificar producción, aplicar migraciones, fusionar la PR ni enviar feedback a Cristina sin revisión/autorización.

## Entrega de cada sesión

Actualizar este documento con evidencias (SHA, CI, logs y pruebas), separar claramente lo probado de lo pendiente y devolver un resumen: **hecho, probado, bloqueado, siguiente tarea**. Priorizar trabajo técnico difícil y lento y no repetir tareas ya completadas.
