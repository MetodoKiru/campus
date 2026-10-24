# Feedback técnico de IA — Panel de formadores y Google Sheets

**Objetivo:** recoger aprendizajes del desarrollo del panel para facilitar la siguiente iteración. Este documento no evalúa a ninguna persona; reconoce el trabajo realizado y propone mejoras concretas antes de habilitar la funcionalidad con datos reales.

## Lo que aporta la implementación

- Propone un flujo útil para el proceso de selección: lista de candidaturas, ficha individual, fases, observaciones, historial y enlace de Calendly.
- Intenta mantener Google Sheets como origen de las candidaturas y usar Supabase para guardar el seguimiento.
- Incluye estados y mensajes de interfaz que ayudan a la persona formadora a entender el proceso.
- El diseño visual es coherente con la identidad del Campus y se puede reutilizar en la siguiente versión.

## Recomendaciones para la próxima iteración

### 1. Validar permisos en el servidor
La sesión iniciada en el navegador no basta para autorizar el acceso a candidaturas. Cada API debe comprobar el token, el rol activo y el alcance de la persona que consulta o modifica datos. La interfaz puede ocultar acciones, pero no sustituye a la autorización del servidor ni a las políticas RLS.

### 2. Definir el modelo de datos antes de sincronizar
El panel utiliza las tablas `candidatos` y `formadores`, que no aparecen en el esquema de Supabase de producción que se inspeccionó. Conviene acordar primero el esquema, sus relaciones, restricciones y políticas, y versionarlo mediante migraciones.

### 3. Usar identificadores estables
Buscar candidatos por nombre puede mezclar personas con el mismo nombre o generar duplicados. La sincronización debería usar un identificador estable de la candidatura o de la fila de origen, con una estrategia para los registros antiguos que no lo tengan.

### 4. Proteger los tokens y enlaces
Los tokens que permiten abrir una candidatura deben generarse con aleatoriedad criptográfica, tratarse como credenciales y no incluirse en listados generales. También conviene validar los enlaces generados para evitar errores de formato y no permitir que una ruta pública dé acceso por conocer un ID interno.

### 5. Comprobar cada escritura
Antes de mostrar un mensaje de éxito, hay que comprobar el resultado de Supabase y tratar los errores. Para cambios de fase, estado e historial, conviene que la actualización sea atómica o que se gestione expresamente cualquier fallo parcial.

### 6. Hacer la sincronización repetible
La misma sincronización debería poder ejecutarse varias veces sin crear duplicados ni sobrescribir datos de seguimiento. Los cambios de Sheets, los registros incompletos y los errores de conexión deben dejar mensajes claros y permitir reintentar.

### 7. Separar secretos y configuración
La hoja, el rango y las credenciales de Google deben configurarse mediante variables de entorno del servidor. Es mejor evitar identificadores de hoja y columnas sensibles incrustados en el código y comprobar que la cuenta de servicio tenga solo los permisos necesarios.

### 8. Probar antes de publicar
Se recomienda probar casos sin sesión, con roles no autorizados, con usuarios desactivados, con IDs de candidaturas ajenas, con nombres duplicados, con errores de Sheets y con fallos de escritura en Supabase. La integración debería pasar lint, TypeScript/build y pruebas de API antes de abrirse a producción.

## Hallazgos concretos detectados durante la revisión

- La ruta de lectura de candidaturas revisada en el repositorio de referencia no comprueba sesión ni rol antes de devolver datos.
- La creación de candidaturas revisada no valida autorización y utiliza `Math.random()` para el token.
- Se observó un enlace generado con un prefijo `https://` duplicado.
- Algunas escrituras de Supabase no comprueban el error antes de mostrar éxito.
- La búsqueda por nombre no garantiza unicidad.
- El panel requiere las tablas `candidatos` y `formadores`, aún no verificadas en el esquema de producción inspeccionado.
- En el Campus oficial, el inicio de sesión y el esquema de perfiles todavía no reconocían el rol `formador`; se ha preparado su incorporación en una rama aislada; todavía no está desplegado ni habilitado en producción.


## Mejoras ya preparadas en la rama de trabajo

- Se añadió un rol `formador` separado y una política de contraseña más robusta para sus cuentas.
- La lectura y edición de candidaturas pasa por APIs de servidor que verifican sesión, rol activo y metadatos del usuario; el navegador no recibe credenciales de Google ni la clave de servicio de Supabase.
- La sincronización guarda un hash del identificador de origen, informa cuando una fila no tiene identificador estable y evita devolver el token de la hoja.
- Los enlaces públicos de candidatura se generan con un token aleatorio independiente de 256 bits. La base de datos conserva solo el hash; el enlace se muestra una vez y renovarlo invalida el anterior.
- El modelo de candidaturas y sus políticas RLS están versionados en migraciones. Las asignaciones de mentor y tutor legal se han movido a operaciones atómicas para reducir estados parciales.
- El banco de inglés A1 se amplió a 100 preguntas y se añadió una prueba automática de IDs, opciones, respuestas, categorías y unidades.
- La rama tiene validación automatizada de lint dirigido y build de producción. Esto verifica la compilación, pero no sustituye las pruebas con cuentas desechables ni la validación de las migraciones en un entorno de pruebas.


## Otros aprendizajes de los cambios revisados

- **Entrada y enrutamiento del formador:** incorporar la ruta al panel desde el login es un buen paso de integración. Para que el rol sea real y no solo visual, deben coincidir el tipo de rol en la base de datos, la creación/edición de cuentas, los metadatos de Auth, el middleware o guard del servidor y las políticas RLS. La rama actual prepara esas piezas de forma coordinada.
- **Asignación exclusiva de mentor:** la regla de que cada alumno tenga un solo mentor es clara y útil. La implementación anterior resolvía el caso funcional, pero una estrategia de borrar todas las relaciones y volver a insertarlas puede dejar asignaciones incompletas si falla a mitad del proceso. En la nueva rama se propone una operación atómica por alumno, que no toca las asignaciones de los demás.
- **Retirada de datos de ejemplo:** quitar un alumno ficticio reduce confusión. Como siguiente paso, conviene que el panel obtenga alumnos, asignaturas y permisos de la base de datos en lugar de mantener una lista fija; así el panel no depende de una única alumna de prueba.
- **Validación de compilación y dependencias:** las integraciones nuevas deben pasar `npm ci`, lint y build. Conviene mantener `package.json` y `package-lock.json` sincronizados y probar el resultado con el mismo lockfile que se desplegará.
- **Evolución gradual:** la propuesta visual y el flujo de selección pueden conservarse; las mejoras principales son de integración, seguridad, persistencia y pruebas, no una crítica al diseño ni a la persona que lo desarrolló.

## Siguiente paso recomendado

Conservar el flujo y la experiencia visual como base, pero reconstruir la integración con una API protegida, esquema versionado, sincronización idempotente y pruebas automatizadas. La prioridad es que la funcionalidad sea fiable y segura para el equipo y las candidaturas, sin importar si los datos vienen de Sheets o de otra fuente en el futuro.

**Estado:** feedback de revisión. No implica que todos los cambios recomendados se hayan implementado ni que la integración esté aprobada para producción.

## Seguimiento de revisión — cambios posteriores (24 de octubre de 2026)

En el commit `b71518d686eb5ab852c97fb2d1ae3dff4465c70c` se retiró el alumno de ejemplo Álvaro del panel de mentor y se ajustó el texto del generador de flashcards. Es positivo eliminar datos ficticios para reducir confusiones durante las pruebas.

Como siguiente mejora, el panel debería dejar de depender de una lista fija que actualmente conserva a Carmen y de asignaturas definidas en el código. Lo recomendable es obtener alumnos, asignaturas y relaciones desde Supabase, filtrados por las asignaciones autorizadas del mentor. Así el panel reflejará las cuentas reales y no necesitará editar código cada vez que se incorpore o cambie un alumno.

También conviene conservar la información de límites funcionales en la interfaz: si el generador admite un máximo concreto de tarjetas, el texto y la validación deben coincidir; si no existe ese límite, se puede retirar la cifra, como se hizo en el cambio revisado.

Estas observaciones se refieren al comportamiento del producto y a su mantenibilidad, no a la persona que realizó los cambios. La retirada del dato ficticio es un paso útil; la siguiente iteración puede completar la transición hacia datos dinámicos y permisos comprobados en servidor.
