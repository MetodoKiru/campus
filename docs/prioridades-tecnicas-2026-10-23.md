# Estado de prioridades técnicas — Campus Kiru

Fecha de revisión: 23 de octubre de 2026. Repositorio oficial: `MetodoKiru/campus-kiru`.

## Orden acordado con Claude

La prioridad no es terminar primero el rol formador. El orden de trabajo es: **seguridad y acceso → pruebas con los cuatro roles existentes → eliminación segura de cuentas → copias y restauración → motor de Inglés → coherencia visual y panel de administración → verificación del despliegue → después, formador**.

## Estado por prioridad

1. **Seguridad y acceso con Supabase Auth.** El login valida sesión, perfil activo y rol, y redirige a los paneles correspondientes. La lectura de flashcards tiene una política RLS corregida en `main`. En la rama de trabajo se ha añadido una migración para reforzar las políticas de relaciones frente a administradores desactivados. Sigue pendiente una prueba end-to-end con cuentas de prueba independientes para alumno, mentor, padre y admin, incluyendo intentos de acceso cruzado y recuperación de acceso. Supabase Security Advisor sigue avisando de que la protección de contraseñas filtradas está desactivada; no se ha cambiado en producción.

2. **Administración de cuentas reales.** La API de administración comprueba la sesión y el perfil activo. La rama incluye comprobaciones de duplicados y salvaguardas para no cambiar el propio rol ni dejar el Campus sin administrador activo. La eliminación bloquea cuentas con pagos asociados y limpia relaciones, documentos, flashcards y registros. **Riesgo pendiente:** la limpieza de datos se ejecuta mediante varios pasos secuenciales, no en una única transacción; un fallo intermedio puede dejar una limpieza parcial. No ejecutar una eliminación real hasta probar con una cuenta desechable y definir recuperación ante fallos.

3. **RLS y permisos.** La política de lectura de flashcards está corregida y versionada en `main`. En la rama se añade `kiru_is_active_admin()` y se refuerzan políticas de relaciones. Falta probar las cuatro cuentas existentes y el futuro rol formador con usuarios independientes. Performance Advisor informó 36 avisos `auth_rls_initplan` y dos índices únicos redundantes en `kiru_app_records`; no se deben modificar en producción sin revisar semántica, medir y probar.

4. **Copias de seguridad y restauración.** El workflow de backup de PostgreSQL generó un artefacto cifrado y pasó la comprobación de listado con `pg_restore`; todavía no se ha probado una restauración completa. El workflow de Storage terminó correctamente, pero descargó 0 archivos y la consulta a `storage.objects` devolvió una tabla vacía. Confirmar si no hay archivos que respaldar y probar restauración en un entorno aislado antes de dar esta prioridad por cerrada.

5. **Motor de Inglés A1.** En la rama, `lib/english-engine.ts` contiene 100 preguntas A1 en cinco unidades, incluidas Food & Shopping, Places & Directions y Free Time & Abilities. Se añadió `scripts/validate-english-engine.cjs` y el script `npm run test:english`. Un workflow anterior sobre el merge commit `05cabefe999756db68497cb196c764493c3a7d1f` falló porque aquella versión tenía 101 preguntas; el archivo consultado después en la rama contiene 100. Hay que volver a ejecutar la validación contra el head actual. **La experiencia actual solo cubre Grammar, Vocabulary y Everyday English con preguntas de opción múltiple.** El siguiente desarrollo debe ampliar a Grammar, Use of English, Vocabulary, Reading, Listening, Writing y Everyday English; Reading/Listening/Writing necesitan tipos de ejercicio propios (texto de lectura, audio y respuesta libre), no solo renombrar categorías. Mantener la experiencia cotidiana actual.

6. **Experiencia visual y panel de administración.** Sigue pendiente unificar la estética y navegación de mentor, familia y admin; revisar la previsualización del administrador y retirar el botón de seis usuarios si sigue presente. Comprobar también que el cierre de sesión está implementado en todas las herramientas/paneles relevantes y que no quedan datos ficticios.

7. **Despliegue y verificación final.** Los checks de Vercel de un deployment de preview más reciente aparecen en verde para el commit `8734e7358208012cc9aeaa898f0305bc2422e5db`, pero eso no prueba qué versión está en producción. Debe identificarse el deployment de producción, confirmar su SHA y revisar errores/runtime. No fusionar la rama ni aplicar migraciones a producción hasta tener build verificable y pruebas aisladas.

8. **Rol formador y adaptación de Cristina.** La rama `feature/formador-role-foundation` prepara el rol, panel, APIs protegidas, sincronización con Google Sheets, Calendly y portal de candidatura con tokens aleatorios de 256 bits almacenados solo como hash. También incluye asignaciones atómicas de mentor y tutor. No se han aplicado sus migraciones a producción. El trabajo útil de Cristina (flujo de candidatos, fases, observaciones, historial, Sheets y Calendly) se ha tomado como referencia, no copiado sin revisión. El documento `docs/feedback-tecnico-panel-formador.md` es un borrador para revisar antes de enviárselo. Los enlaces antiguos de candidaturas no son compatibles con el nuevo portal y deberán renovarse si se aprueba el despliegue.

## Otros hallazgos

- El último `npm ci` de GitHub Actions mostró 5 vulnerabilidades en dependencias (4 altas y 1 crítica). Revisar `npm audit` y el árbol afectado antes de aplicar actualizaciones; no usar `npm audit fix --force` sin revisar cambios incompatibles.
- Las migraciones de formador, candidaturas, asignación atómica de mentor/tutor y endurecimiento de RLS están versionadas en la rama de trabajo, no aplicadas a producción.
- No se han borrado cuentas reales, creado relaciones ficticias ni importado candidaturas reales para probar.
