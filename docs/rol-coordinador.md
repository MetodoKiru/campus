# Rol de coordinador y registros de sesión

Fecha: 25/10/2026. Corresponde al apartado 2 del Sprint 3 («Rol de coordinador») y
a una primera parte del apartado 4 (conexión con el formulario de registro de
sesión). El seguimiento del mentor ya incorporado es del coordinador, no del
formador.

## Qué hace administración

- Crea la cuenta con el rol «Coordinador/a» desde «Usuarios y Enlaces».
- En «Enlazar Coordinador y Mentor» elige el coordinador de cada mentor. Cada
  mentor tiene uno; cada coordinador lleva como mucho 5 (lo impide la base de
  datos). Elegir «Sin coordinador» quita el enlace.
- Los alumnos se enlazan con su mentor como siempre. Llegan al coordinador a
  través del mentor: si un alumno cambia de mentor, cambia de coordinador solo.
- El botón «Seguimiento de mentores» abre el mismo panel con todos los mentores,
  un filtro por coordinador y la lista «Sin asignar».

## Qué ve el coordinador (`/coordinador`)

- **Mis mentores**: una tarjeta por mentor con alumnos, último registro de
  sesión, registros de los últimos 30 días (y cuántos se enviaron tarde), alumnos
  sin registro en más de 8 días, cuándo entró al campus, incidencias abiertas,
  tareas enviadas y su última actividad. Al pulsarla, la tabla de sus alumnos
  (familia, último registro, si el alumno ha practicado en el campus, tareas) y
  sus últimos registros completos.
- **Incidencias**: lo que el mentor escribe en «Incidencia» del formulario. El
  coordinador la marca como revisada con una nota; la nota no la ve el mentor.
- **Registros de sesión**: todas las respuestas del formulario de sus mentores.

Solo lectura en todo lo demás: el coordinador no crea ni borra usuarios, no
asigna alumnos y no ve pagos. Lo comprueban las pruebas de
`supabase/tests/rls_roles_test.sql`.

## Cómo llegan los registros de sesión

El formulario de Google sigue siendo el único sitio donde el mentor registra la
sesión. Un Apps Script dentro de la hoja de respuestas
(`docs/apps-script/registro-sesion-al-campus.gs`) manda las respuestas a
`/api/registros/importar` al enviarse cada formulario y, además, cada hora. La
ruta está protegida con la clave `KIRU_REGISTROS_SECRET` (en Vercel y en las
propiedades del script). Reenviar no duplica: cada respuesta se identifica por
su marca temporal, mentor y alumno.

El mentor y el alumno se reconocen por el correo de quien envía (si coincide con
la cuenta del mentor) o por el nombre escrito, que basta con que sea el nombre
de pila de la cuenta («Paula» → «Paula Ybarra»). Lo que no se reconoce aparece en
«Sin asignar» para administración. La columna «Estado de pago» no se copia.

Elegimos esto en lugar de la cuenta de servicio de Google del Sprint 3 porque no
hay que crear nada en Google Cloud y los datos llegan al momento.

## Cambios en la base de datos

`20261025170000_coordinador_role_and_session_logs.sql`: rol `coordinador`,
tablas `kiru_coordinator_mentors`, `kiru_session_logs` y `kiru_incident_reviews`,
y la rama de lectura del coordinador en las políticas de `profiles`, `students`,
`student_mentors`, `student_guardians` y `kiru_app_records`.

## Pendiente (siguientes pasos del Sprint 3)

- Plan de sesiones con horario: con él, «sin registro reciente» pasa a ser «esta
  sesión concreta está pendiente de registro».
- Botón «Registrar sesión» en el panel del mentor con el formulario prellenado.
- SkillCoins reales a partir del formulario.
