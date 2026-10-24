# Handoff para la siguiente sesión de Claude — Campus Kiru

**Actualizado:** 24 de octubre de 2026  
**Repositorio oficial:** `MetodoKiru/campus-kiru`  
**PR principal de trabajo:** https://github.com/MetodoKiru/campus-kiru/pull/2  
**Rama:** `feature/formador-role-foundation`  
**Estado:** draft; no fusionar ni aplicar migraciones a producción todavía.

## Instrucción principal

Continúa desde el estado actual. Respeta el orden de prioridades de la propietaria: seguridad/RLS y login, borrado seguro, restauración de backups, motor de inglés, coherencia visual y despliegue. El rol formador y el trabajo de Cristina se preparan en paralelo, pero no deben adelantar ni sustituir esas prioridades.

Aprovecha los cambios de Cristina como referencia de flujo y diseño, no como una copia directa. El documento `docs/feedback-tecnico-panel-formador.md` está redactado en tono constructivo y no personal; es un borrador para que la propietaria decida si enviarlo. No lo envíes automáticamente.

## Avances confirmados

### Seguridad y dependencias
- La lectura de flashcards se corrigió y la migración quedó aplicada en Supabase de producción el 23-10; faltan pruebas de acceso con cuentas de cada rol.
- Se fusionó a `main` la actualización de Next.js y `eslint-config-next` a **16.4.3**, validada con `npm ci`, `npm audit --audit-level=high` y build de producción.
- Se fusionó a `main` la actualización del lockfile a **Zod 4.6.7** para resolver la alerta alta `GHSA-mrhx-c7xc-m3w5`. El flujo aislado pasó instalación, auditoría y build.
- Se retiró de `main` el script obsoleto `backup_kiru.sql`, que creaba un esquema antiguo y cuentas de ejemplo.
- Supabase Security Advisor sigue avisando que la protección de contraseñas filtradas está desactivada. Las herramientas conectadas no ofrecen un ajuste directo para activarla; debe revisarse en Auth > Password Security del Dashboard.
- La última revisión de logs de Supabase (24 h) encontró tres errores de autenticación PostgreSQL para el usuario `postgres`, concentrados en un mismo segundo del 23-10. La causa no está confirmada; comprobar si coincide con un job/secret de conexión antes de asumir un incidente.

### Rama de trabajo
- Se preparó el rol `formador` coordinando el tipo de rol, creación/edición de cuentas, metadatos de Auth, redirección de login, panel protegido y autorización de servidor.
- Se añadieron migraciones para candidaturas, asignaciones atómicas de mentor/tutor y endurecimiento de RLS frente a administradores desactivados.
- Se añadió una segunda migración que reemplaza las comprobaciones administrativas basadas solo en JWT por un helper que comprueba también `profiles.is_active` en las políticas públicas afectadas.
- Se añadió un test de migración en PostgreSQL desechable a CI para active-admin RLS y las asignaciones atómicas de mentor/tutor. La prueba del helper RLS ya pasó; el run más reciente debe confirmar también la prueba ampliada y el build.
- El borrado de cuentas bloquea cuando pagos referencian al usuario como alumno o creador; prevalida documentos/flashcards, desactiva la cuenta antes de limpiar e identifica el paso que falla. Sigue siendo secuencial y no transaccional; si falla, la cuenta permanece inactiva y necesita revisión. Requiere prueba con cuenta desechable y estrategia de recuperación.
- El temporizador y la persistencia concurrente de registros se han corregido/mejorado en la rama.
- Se corrigió logout de Supabase en alumno, mentor, padre y admin.
- El motor de Inglés A1 se amplió a **120 preguntas**, cinco unidades y cinco áreas: Grammar, Vocabulary, Everyday English, Use of English y Reading. Reading incluye pasajes. Listening necesita audios reales; Writing necesita respuesta libre y rúbrica.
- CI anterior en la rama pasó instalación, validador de inglés, lint dirigido y build. Los cambios posteriores añadieron el test SQL, por lo que debe comprobarse el run del head más reciente.

### Backups
- El workflow de PostgreSQL generó un artefacto cifrado y `pg_restore --list` funcionó; la restauración completa no se ha probado.
- El workflow de Storage terminó correctamente, pero informó **0 archivos** en el bucket `kiru-documents`. Confirmar si sigue vacío y probar recuperación cuando exista un archivo de prueba legítimo.
- El runbook está en `docs/BACKUP_AND_RECOVERY.md`. Nunca restaurar sobre producción como prueba.

### Cristina / repositorio de referencia
- Repo revisado: https://github.com/silvia051206-droid/campus-kiru
- Se revisaron los cambios de Cristina del 17 y 22 de octubre, incluyendo acceso al panel, sincronización con Google Sheets, fases, observaciones, Calendly, asignación exclusiva de mentor y retirada del alumno ficticio.
- Hallazgos útiles para aprender: comprobar permisos en servidor y RLS; definir tablas/migraciones antes de sincronizar; usar identificadores estables; generar tokens criptográficamente seguros; comprobar cada escritura; evitar borrar todas las relaciones antes de volver a insertarlas; mantener datos de panel dinámicos.
- No se ha copiado código directamente del repositorio externo a producción. El feedback está en `docs/feedback-tecnico-panel-formador.md`.

## Orden obligatorio antes de producción

### P0 — Seguridad, login y permisos
1. Revisar el resultado del CI más reciente, incluido el test SQL de RLS en PostgreSQL desechable.
2. Probar con cuentas desechables los cuatro roles existentes: login, redirección, sesión caducada, perfil inactivo y acceso cruzado.
3. Revisar RLS en tablas y Storage. La migración de active-admin debe pasar la prueba aislada y revisión antes de aplicarse; no aplicar migraciones de la rama a producción.
4. Dar a la propietaria los pasos para activar leaked-password protection en Supabase Auth.
5. Aclarar los tres fallos de autenticación PostgreSQL de los logs si coinciden con un job de backup; no rotar secretos sin identificar el origen, salvo que aparezcan más señales de uso no autorizado.

### P1 — Eliminación segura
6. Diseñar un flujo recuperable/transaccional o por etapas para la eliminación de cuentas.
7. Probar con una cuenta desechable, incluyendo fallo en cada etapa, historial de pagos, documentos, aceptaciones, flashcards, avisos, relaciones y Storage. Nunca borrar usuarios reales como prueba.

### P2 — Backups
8. Restaurar PostgreSQL en un entorno aislado y validar esquema, constraints, RLS y datos.
9. Confirmar si Storage está vacío; probar restauración en un bucket/entorno aislado si procede.
10. No declarar los backups plenamente validados hasta completar una restauración real.

### P3 — Inglés
11. Mantener el validador de 120 preguntas y cinco áreas.
12. Añadir Listening con audio y reproducción; añadir Writing con respuesta libre, criterios y feedback. No simular estas áreas como test de opción múltiple.
13. Probar asignación por mentor, filtros, finalización y persistencia del resultado en Supabase.

### P4 — Diseño y paneles
14. Unificar navegación, tipografía, espaciado, estados de carga y mensajes en mentor, familia y admin.
15. Revisar el panel de administración y quitar botones de datos de prueba si quedan. Eliminar datos demo y comprobar que los alumnos/relaciones se obtienen de la base de datos.
16. Probar logout y persistencia con cuentas desechables.

### P5 — Despliegue
17. El proyecto Vercel que expone el conector es `metodo-kiru-14vn`, enlazado al repo `MetodoKiru/metodo-kiru`, no a `MetodoKiru/campus-kiru`. No asumir que Campus Kiru está desplegado allí ni crear/desplegar un nuevo proyecto sin verificar el destino y sus variables.
18. Los checks de Vercel para commits de Campus Kiru han mostrado `build-rate-limit` en el plan Hobby. El build de GitHub Actions es útil, pero no demuestra que el código esté publicado.
19. Confirmar proyecto, commit y runtime reales antes de promover la rama.

### P6 — Formador
20. Solo tras P0–P5, probar el flujo de formador en staging: permisos, Google Sheets idempotente, duplicados, errores de Google, notas/historial, fases, Calendly y portal.
21. Planificar renovación de enlaces antiguos antes de habilitar el portal nuevo.
22. Mantener la PR #2 en draft hasta que las validaciones previas estén cerradas.

## Bloqueos y límites
- No crear una rama Supabase de desarrollo si implica coste sin informarlo y obtener autorización.
- No crear cuentas falsas ni relaciones ficticias en producción.
- No subir claves de descifrado, service-role keys ni secretos a GitHub, documentación o chat.
- No fusionar ni desplegar el flujo formador ni aplicar migraciones de esta rama a producción antes de revisar y probar.

## Entrega de cada sesión
Actualizar este documento con SHA, enlaces de CI, pruebas y evidencia. Separar claramente **hecho**, **probado**, **pendiente** y **bloqueado**. Priorizar trabajo técnico de alto impacto y no repetir tareas completadas.
