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

## Siguiente paso recomendado

Conservar el flujo y la experiencia visual como base, pero reconstruir la integración con una API protegida, esquema versionado, sincronización idempotente y pruebas automatizadas. La prioridad es que la funcionalidad sea fiable y segura para el equipo y las candidaturas, sin importar si los datos vienen de Sheets o de otra fuente en el futuro.

**Estado:** feedback de revisión. No implica que todos los cambios recomendados se hayan implementado ni que la integración esté aprobada para producción.
