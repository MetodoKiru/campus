# Estado de prioridades técnicas — Campus Kiru

Fecha de revisión: 23 de octubre de 2026. Repositorio oficial: `MetodoKiru/campus-kiru`.

## Orden acordado con Claude

La prioridad no es terminar primero el rol formador. El orden de trabajo es: **seguridad y acceso → pruebas con los cuatro roles existentes → eliminación segura de cuentas → copias y restauración → motor de Inglés → coherencia visual y panel de administración → verificación del despliegue → después, formador**.

## Estado por prioridad

1. **Seguridad y acceso con Supabase Auth.** El login valida sesión, perfil activo y rol, y redirige a los paneles correspondientes. La lectura de flashcards tiene una política RLS corregida en `main`. En la rama de trabajo se ha añadido una migración para reforzar las políticas de relaciones frente a administradores desactivados. Sigue pendiente una prueba end-to-end con cuentas de prueba independientes para alumno, mentor, padre y admin, incluyendo intentos de acceso cruzado y recuperación de acceso. En esta rama se corrigieron los controles de cierre de sesión de alumno, mentor, padre y admin para ejecutar `supabase.auth.signOut()` antes de volver al login; el panel formador ya lo hacía. La compilación pasa, pero aún falta probarlo con sesiones reales de prueba. Supabase Security Advisor sigue avisando de que la protección de contraseñas filtradas está desactivada; no se ha cambiado en producción.

2. **Administración de cuentas reales.** La API de administración comprueba la sesión y el perfil activo. La rama incluye comprobaciones de duplicados y salvaguardas para no cambiar el propio rol ni dejar el Campus sin administrador activo. La eliminación bloquea cuentas con pagos asociados y limpia relaciones, documentos, flashcards y registros. **Riesgo pendiente:** la limpieza de datos se ejecuta mediante varios pasos secuenciales, no en una única transacción; un fallo intermedio puede dejar una limpieza parcial. No ejecutar una eliminación real hasta probar con una cuenta desechable y definir recuperación ante fallos.

3. **RLS y permisos.** La política de lectura de flashcards está corregida y versionada en `main`. En la rama se añade `kiru_is_active_admin()` y se refuerzan políticas de relaciones. Falta probar las cuatro cuentas existentes y el futuro rol formador con usuarios independientes. Performance Advisor informó 36 avisos `auth_rls_initplan` y dos índices únicos redundantes en `kiru_app_records`; no se deben modificar en producción sin revisar semántica, medir y probar.

4. **Copias de seguridad y restauración.** El workflow de backup de PostgreSQL generó un artefacto cifrado y pasó la comprobación de listado con `pg_restore`; todavía no se ha probado una restauración completa. El workflow de Storage terminó correctamente, pero descargó 0 archivos y la consulta a `storage.objects` devolvió una tabla vacía. Confirmar si no hay archivos que respaldar y probar restauración en un entorno aislado antes de dar esta prioridad por cerrada.

5. **Motor de Inglés A1.** En la rama, `lib/english-engine.ts` contiene 120 preguntas A1 en cinco unidades, incluidas Food & Shopping, Places & Directions y Free Time & Abilities. Se añadió `scripts/validate-english-engine.cjs` y el script `npm run test:english`. Un workflow anterior sobre el merge commit `05cabefe999756db68497cb196c764493c3a7d1f` falló porque aquella versión tenía 101 preguntas. En el head actual `c89d85554bb41440b301d56d61b3137e9105ef54`, el validador ya ha pasado: 120 preguntas, cinco unidades y tres categorías. **La experiencia actual solo cubre Grammar, Vocabulary, Everyday English, Use of English y Reading con preguntas de opción múltiple.** El siguiente desarrollo debe ampliar a Grammar, Use of English, Vocabulary, Reading, Listening, Writing y Everyday English; Reading/Listening/Writing necesitan tipos de ejercicio propios (texto de lectura, audio y respuesta libre), no solo renombrar categorías. Mantener la experiencia cotidiana actual.

6. **Experiencia visual y panel de administración.** Sigue pendiente unificar la estética y navegación de mentor, familia y admin; revisar la previsualización del administrador y retirar el botón de seis usuarios si sigue presente. Comprobar también que el cierre de sesión está implementado en todas las herramientas/paneles relevantes y que no quedan datos ficticios.

7. **Despliegue y verificación final.** La compilación, TypeScript, lint específico y test de Inglés han pasado en GitHub Actions para el head `c37eaa8cb35d9c8918df9a2ac1a24bed142f8921` (run `39972660842`), incluyendo los cambios de cierre de sesión. Los checks de Vercel del head más reciente siguen bloqueados por `build-rate-limit`; un preview anterior de `8734e7358208012cc9aeaa898f0305bc2422e5db` sí aparece en verde. El deployment de producción identificado sigue en `main`, SHA `5816d33ba34adbb14341b8e0015eef937f6b168d`. Falta confirmar runtime/errores y validar en staging. No fusionar la rama ni aplicar migraciones a producción.

8. **Rol formador y adaptación de Cristina.** La rama `feature/formador-role-foundation` prepara el rol, panel, APIs protegidas, sincronización con Google Sheets, Calendly y portal de candidatura con tokens aleatorios de 256 bits almacenados solo como hash. También incluye asignaciones atómicas de mentor y tutor. No se han aplicado sus migraciones a producción. El trabajo útil de Cristina (flujo de candidatos, fases, observaciones, historial, Sheets y Calendly) se ha tomado como referencia, no copiado sin revisión. El documento `docs/feedback-tecnico-panel-formador.md` es un borrador para revisar antes de enviárselo. Los enlaces antiguos de candidaturas no son compatibles con el nuevo portal y deberán renovarse si se aprueba el despliegue.

## Otros hallazgos

- Un workflow anterior informó 5 vulnerabilidades (4 altas y 1 crítica). En el CI actual, `npm ci` terminó con **0 vulnerabilidades** tras actualizar el lockfile; confirmar que el resultado se mantiene en los siguientes runs. El paquete `eslint` muestra un aviso de versión obsoleta, aunque el build pasó.
- Las migraciones de formador, candidaturas, asignación atómica de mentor/tutor y endurecimiento de RLS están versionadas en la rama de trabajo, no aplicadas a producción.
- No se han borrado cuentas reales, creado relaciones ficticias ni importado candidaturas reales para probar.

- **Dependencias (revisión 24-10):** una nueva auditoría detectó una alerta alta de Zod (`GHSA-mrhx-c7xc-m3w5`) en la versión transitiva 4.4.3. Se actualizó el lockfile a Zod 4.6.7 mediante `npm audit fix --package-lock-only`; falta confirmar el nuevo `npm audit --audit-level=high` y build sobre el commit actualizado.

- **RLS:** se añadió una migración de revisión que sustituye las comprobaciones administrativas basadas solo en JWT por una comprobación de administrador activo en `profiles` para las políticas públicas que usan `kiru_role`. Está en la rama de trabajo; aún requiere revisión SQL y prueba en un entorno aislado antes de aplicarla.
- **Borrado de cuentas:** la comprobación previa de pagos incluye tanto al alumno como al autor del registro; los documentos y conjuntos de flashcards se prevalidan antes de limpiar, y la cuenta se desactiva antes de iniciar la limpieza. Los errores identifican el paso que falló. Sigue siendo una secuencia no transaccional: la prueba con cuenta desechable y el plan de recuperación continúan pendientes.

- **Vercel:** la conexión disponible solo muestra el proyecto `metodo-kiru-14vn`, enlazado al repositorio `MetodoKiru/metodo-kiru`; no aparece un proyecto accesible enlazado a `MetodoKiru/campus-kiru`. No crear ni promover un proyecto nuevo sin confirmar el destino, las variables de entorno y el dominio previsto.

## Seguimiento — 24 de octubre de 2026

- **CI:** GitHub Actions completó con éxito el run 142 de Campus Kiru y el run 41 de validación de dependencias para el commit `58a7070a`. Después se hicieron cambios menores de documentación y se corrigió el mensaje del validador de IDs para que indique 120; todavía no se ha podido confirmar un run de Actions asociado al último commit. Los checks de Vercel continúan fallando por el límite de despliegues del plan Hobby, por lo que no hay evidencia de publicación nueva.
- **Inglés:** el validador espera 120 IDs consecutivos y se corrigió el texto de error que decía por equivocación “1 a 100”. Listening y Writing siguen pendientes; no se deben representar como preguntas de opción múltiple.
- **Supabase:** la consulta actual confirma cero objetos en `storage.objects`. Se han encontrado únicamente los tres fallos de autenticación PostgreSQL ya observados el 23 de octubre; no aparecieron nuevos en la consulta reciente. El origen sigue sin atribuirse.
- **Feedback de Cristina:** se añadió una nota constructiva sobre el cambio que retiró el alumno ficticio Álvaro: es una mejora, y la siguiente evolución sería cargar alumnos y asignaturas desde Supabase en lugar de conservar a Carmen como dato fijo.
