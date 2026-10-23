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
- La rama añade controles a la API de cuentas: sesión/rol activo, comprobación de duplicados, protección contra cambios de rol propios y contra degradar al último admin.
- Se ha mejorado el guardado concurrente de registros y la lectura del temporizador.
- Las asignaciones de mentor y tutor se prepararon como RPC atómicas con validación de roles.
- Se añadió una migración para endurecer las políticas RLS de relaciones frente a administradores desactivados.
- Se generó un backup cifrado de PostgreSQL y se pudo inspeccionar su lista de contenido; la restauración completa sigue sin probarse.
- El workflow de Storage informó 0 archivos; confirmar si el almacenamiento está vacío y probar recuperación.
- El motor A1 de Inglés en la rama contiene 100 preguntas en cinco unidades. Se añadió un validador automático. Un workflow anterior falló porque el merge commit probado contenía 101 preguntas; el archivo consultado después contiene 100. Volver a validar el head actual.
- Existe el borrador de feedback constructivo en `docs/feedback-tecnico-panel-formador.md`.
- El panel formador y portal de candidaturas están aislados en la rama. Los tokens del nuevo portal son aleatorios de 256 bits y se almacena solo el hash. Los enlaces antiguos deberán renovarse si se aprueba el lanzamiento.
- Los checks de Vercel de un preview asociado al commit `8734e7358208012cc9aeaa898f0305bc2422e5db` aparecen en verde; esto no demuestra qué SHA está publicado en producción.

## Orden obligatorio

### P0 — Seguridad, login y permisos
1. Identificar el head actual de la PR y ejecutar CI sobre ese commit.
2. Probar con cuentas desechables los cuatro roles actuales: login, redirección, sesión caducada, perfil inactivo y acceso cruzado.
3. Supabase Security Advisor marca desactivada la protección de contraseñas filtradas. Si no se puede activar con herramientas, dar a la propietaria los pasos exactos desde Supabase.
4. Revisar RLS de tablas y Storage; no aplicar migraciones en producción.
5. Investigar las 5 vulnerabilidades que aparecieron en `npm ci` (4 altas y 1 crítica). Ejecutar auditoría y proponer actualizaciones compatibles; no usar `npm audit fix --force` sin revisar incompatibilidades.

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
13. Ejecutar el validador de `lib/english-engine.ts` en el head actual.
14. Ampliar a siete áreas: **Grammar, Use of English, Vocabulary, Reading, Listening, Writing y Everyday English**, sin eliminar Everyday English.
15. No fingir Listening/Writing como opción múltiple. Diseñar tipos reales: lectura con preguntas, audio reproducible y respuesta libre con feedback; definir contenidos/archivos y derechos de uso.
16. Mantener filtros de unidad, dificultad y cantidad; comprobar asignación por mentor, finalización por alumno, feedback y persistencia en Supabase.
17. Añadir tests de estructura, IDs, categorías, opciones/respuestas, asignación y persistencia.

### P4 — Diseño y administración
18. Unificar navegación, tipografía, espaciado, estados de carga y mensajes de mentor, familia y admin.
19. Revisar la previsualización del administrador y retirar el botón de seis usuarios si sigue presente.
20. Confirmar logout en todos los paneles/herramientas, retirar datos demo y verificar que no quedan alumnos ficticios.
21. Confirmar que los formularios reflejan el estado realmente guardado en Supabase.

### P5 — Despliegue
22. Identificar el deployment de producción y su commit exacto; no confundir previews con producción.
23. Revisar logs/runtime y variables de entorno sin exponer secretos.
24. Hacer build/lint/tests y pruebas de roles en staging; después proponer integración a `main`.

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
