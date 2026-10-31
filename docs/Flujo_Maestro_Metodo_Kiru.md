# MÉTODO KIRU — Flujo maestro de incorporación de familias y asignación de mentores

> Documento de referencia funcional, enviado por Sofía el 31/10/2026.
> Describe el proceso **deseado**; no certifica que esté implementado.
> Lo que realmente está hecho, probado y desplegado se registra aparte, en
> `docs/auditoria-flujo-maestro.md`.

## 1. Objetivo

Adaptar el campus existente de Método Kiru para centralizar y automatizar progresivamente la incorporación de familias, la asignación de alumnos a mentores y la coordinación del servicio.

El objetivo es reducir las tareas manuales de la fundadora y permitir que, en el futuro, el coordinador gestione la operativa desde la plataforma.

**Principio fundamental:** aprovechar y adaptar las funcionalidades existentes. No reconstruir módulos que ya funcionan.

## 2. Estado actual del campus

El campus ya dispone de:

- Roles de administrador, coordinador, formador y padres.
- Paneles asociados a los distintos roles.
- Una base de matching entre alumnos y mentores.
- Comunicaciones por correo relacionadas con las propuestas de asignación.
- Funcionalidades de consulta de documentos y firma.
- Una infraestructura basada en Next.js, React, Tailwind CSS, Supabase y Vercel.

Estas funcionalidades deben revisarse antes de modificarlas. Su existencia no implica que todos los procesos descritos en este documento estén terminados.

## Fase 1. Captación de la familia

Responsable actual: fundadora.

1. La familia contacta por WhatsApp, teléfono u otro canal.
2. La fundadora mantiene la primera conversación.
3. Explica el programa, facilita la web y presenta las tarifas.
4. Ofrece el descuento correspondiente.
5. Si la familia quiere continuar, se registra como familia potencial en el campus.

**Estado:** proceso existente, principalmente manual.

**Pendiente:**

- Facilitar el registro de nuevas familias.
- Registrar el estado comercial y la siguiente acción.
- Evitar que se pierdan contactos interesados.

## Fase 2. Portal de incorporación de familias

Responsable: plataforma, con supervisión del administrador o coordinador.

Cuando la familia decide continuar, recibe un correo de invitación para acceder a su espacio privado.

La cuenta puede crearse antes de que el alumno comience el programa. Su acceso y las funciones disponibles dependerán de la fase en la que se encuentre.

Desde su espacio, la familia podrá:

- Consultar las tareas pendientes.
- Completar los formularios.
- Consultar la propuesta personalizada.
- Revisar las instrucciones y el estado del pago.
- Consultar la información operativa que le corresponda.
- Ver los pasos necesarios para comenzar.

El sistema registra el progreso y notifica al responsable cuando debe intervenir.

### Estados generales propuestos

1. Familia potencial.
2. Incorporación en curso.
3. Propuesta enviada.
4. Propuesta aceptada.
5. Pago pendiente.
6. En selección de mentor.
7. Mentor asignado.
8. Documentación y organización pendientes.
9. Preparado para comenzar.
10. Servicio activo.

Los estados definitivos deben adaptarse al modelo de datos existente y evitar contradicciones entre fases.

**Prioridad:** alta.

## Fase 3. Formularios y expediente del alumno

La familia completa los formularios desde su espacio privado.

**A. Formulario de incorporación.** Debe recoger los datos del alumno y de su familia, sus necesidades, objetivos y la información necesaria para preparar el acompañamiento.

**B. Formulario de coordinación con el entorno educativo.** Debe recoger los datos necesarios para contactar con el colegio y otros profesionales relevantes, cuando proceda. El acceso a esta información y su comunicación a terceros deben respetar las autorizaciones y los permisos correspondientes.

**C. Formulario de disponibilidad familiar.** Debe recoger la disponibilidad de los padres para las llamadas de seguimiento y la información necesaria para organizar las comunicaciones.

**Resultado esperado:** toda la información queda centralizada en el expediente del alumno, con acceso limitado a los roles autorizados.

**Estado:** revisar los formularios existentes y crear o adaptar únicamente los que falten.

**Prioridad:** muy alta.

## Fase 4. Matching y contacto con mentores

Responsables: plataforma y administrador o coordinador.

Los mentores ya han superado el proceso de selección y están admitidos en Método Kiru. Esta fase se ocupa de asignarles alumnos, no de volver a seleccionarlos como miembros del equipo.

El matching existente debe conservarse y adaptarse si es necesario.

### Flujo

1. La plataforma identifica mentores compatibles con un alumno potencial.
2. Cada mentor recibe el correo de propuesta de asignación.
3. El mentor recibe también un aviso por WhatsApp, cuando corresponda.
4. El mentor responde indicando si puede asumir la asignación, si propone otro horario o si no está disponible.
5. La plataforma registra la respuesta y actualiza el estado.
6. El administrador o coordinador puede consultar todos los candidatos y sus respuestas desde el panel.

### Respuestas posibles

**Disponible:**

- Se registra la respuesta.
- Se notifica al responsable.
- Se puede solicitar una llamada de aproximadamente 10 minutos.

**Propone otro horario:**

- Se registra la alternativa.
- Se comprueba su compatibilidad con la disponibilidad de la familia.
- Si encaja, se continúa con el proceso.

**No disponible:**

- Se registra la respuesta.
- Se continúa con otros candidatos.

**Sin respuesta:**

- Se registra la falta de respuesta.
- Se activa el seguimiento que se defina.

### Avisos por WhatsApp sin API de pago

Inicialmente, no se contratará una API para automatizar los envíos.

Cuando sea necesario contactar con un mentor, el correo o el panel podrán incluir un enlace que abra WhatsApp con el destinatario y un mensaje preparado.

El administrador o coordinador revisa el mensaje y lo envía manualmente.

**Estado:** matching y correo existentes; avisos adicionales y seguimiento pendientes de revisar.

**Prioridad:** máxima.

## Fase 5. Panel de selección y asignación

Responsable actual: administrador. Responsable futuro previsto: coordinador.

El panel debe permitir gestionar todas las candidaturas de mentores vinculadas a cada alumno.

### Información visible

- Alumno potencial.
- Mentores compatibles.
- Mentores contactados.
- Respuestas recibidas.
- Disponibilidad y alternativas horarias.
- Llamadas pendientes y realizadas.
- Resultado de las entrevistas.
- Decisión final.
- Mentor seleccionado.
- Sustituto previsto, cuando corresponda.

### Acciones del responsable

1. Contactar con un mentor.
2. Registrar o consultar su respuesta.
3. Solicitar una llamada.
4. Registrar el resultado de la conversación.
5. Seleccionar al mentor definitivo.
6. Marcarlo como no seleccionado para esa asignación.
7. Continuar con otros candidatos cuando sea necesario.

**Importante:** marcar a un mentor como no seleccionado para un alumno no significa excluirlo del equipo de Método Kiru. Puede recibir otras oportunidades de asignación.

**Prioridad:** muy alta.

## Fase 6. Ficha de asignación del mentor

Cuando el administrador o coordinador selecciona al mentor, se activa el proceso de formalización.

### Flujo

1. Se confirma la elección en el panel.
2. La plataforma prepara la ficha con los datos disponibles.
3. El mentor recibe una notificación.
4. Accede a su panel y completa la información pendiente.
5. Firma la ficha mediante el mecanismo disponible en el campus.
6. La documentación queda almacenada en el expediente correspondiente.
7. El responsable comprueba que la documentación está completa.

### Información prevista

- Datos necesarios del alumno y de la familia.
- Mentor asignado.
- Objetivos del acompañamiento.
- Información operativa relevante.
- Datos del mentor.
- Condiciones y responsabilidades de la asignación.

**Estado:** existe una base de documentos y firma que debe adaptarse al proceso.

**Prioridad:** alta.

## Fase 7. Propuesta personalizada

Actualmente, la propuesta se elabora manualmente con una plantilla de Canva, incorporando la información del alumno y la fotografía del mentor.

**Objetivo:** reducir el trabajo manual y evitar duplicar datos.

La propuesta debe recoger:

- Programa recomendado.
- Información relevante del acompañamiento.
- Mentor propuesto, cuando corresponda.
- Tarifa.
- Descuento aplicado.
- Condiciones.
- Próximos pasos.

La familia debe poder consultar y aceptar la propuesta mediante un proceso que deje constancia de su decisión.

**Pendiente:**

- Revisar la plantilla actual.
- Definir qué información debe incluir.
- Determinar en qué momento se presenta respecto a la selección del mentor.
- Valorar su generación automática.

**Estado:** plantilla existente; preparación manual.

**Prioridad:** media-alta.

## Fase 8. Pagos y contabilidad

Responsable actual: fundadora.

**Objetivo:** automatizar la gestión administrativa manteniendo el control de los pagos.

### Flujo previsto

1. La familia consulta el importe, el descuento y las instrucciones de pago.
2. Recibe los métodos de pago disponibles y la fecha límite.
3. El sistema envía recordatorios si el pago sigue pendiente.
4. La familia puede indicar que ha realizado el pago.
5. El administrador recibe una notificación.
6. La fundadora comprueba el ingreso en la cuenta bancaria.
7. Confirma el pago mediante una acción en el sistema.
8. El estado se actualiza y se registra la operación en la gestión contable.

### Estados del pago

- Pendiente.
- Declarado por la familia.
- Verificado.
- Vencido o pendiente de revisión.

**Regla fundamental:** indicar que se ha pagado no equivale a tener el pago verificado.

**Pendiente:**

- Definir plazos y recordatorios.
- Revisar los métodos de pago.
- Determinar cómo se registra la operación contable.
- Evitar duplicidades.
- Mantener un historial de las confirmaciones.

**Estado:** proceso manual; automatización pendiente.

**Prioridad:** alta.

## Fase 9. Organización de clases y llamadas

Responsables: familia, mentor y coordinador.

### Clases

1. Se cruzan las disponibilidades de la familia y del mentor.
2. Se acuerdan los días y las horas.
3. Se confirman con la familia.
4. Se registran en el campus.

### Llamadas con la familia

Se prevén dos llamadas mensuales:

- Llamada inicial.
- Llamada final.

El sistema debe permitir registrar las fechas, consultar las próximas llamadas y gestionar cambios de horario.

### Comunicación

Se plantea un grupo de WhatsApp con el mentor y el coordinador, con participación de la fundadora mientras sea necesaria.

**Pendiente:** definir el reparto definitivo de responsabilidades y reducir la coordinación manual.

**Estado:** proceso principalmente manual.

**Prioridad:** alta.

## Fase 10. Kit de bienvenida e inicio del servicio

Está prevista la entrega de la caja de Método Kiru alrededor de la segunda sesión.

**Pendiente de decisión:**

- Quién entrega el kit.
- Cuándo se realiza la entrega.
- Cómo se registra su recepción.

### Lista de comprobación previa al inicio

- Formularios completados.
- Expediente del alumno preparado.
- Mentor seleccionado.
- Sustituto identificado, cuando corresponda.
- Propuesta aceptada.
- Pago verificado, cuando corresponda.
- Ficha del mentor completada.
- Horarios confirmados.
- Llamadas organizadas.
- Entrega del kit planificada.
- Responsables definidos.

La plataforma debe mostrar qué requisitos están cumplidos y cuáles faltan.

**Prioridad:** alta para la comprobación general; media para automatizar la entrega del kit.

## Fase 11. Centralización y permisos

La plataforma debe ser la fuente central de referencia para la gestión operativa.

### Información que debe centralizarse

- Familias potenciales y activas.
- Expedientes de alumnos.
- Formularios.
- Propuestas.
- Estados de pago.
- Candidatos y asignaciones de mentores.
- Fichas firmadas.
- Horarios.
- Llamadas.
- Tareas pendientes.
- Incidencias y seguimiento.

Los correos y WhatsApp sirven para notificar y comunicarse, pero la información relevante debe registrarse en la plataforma.

### Roles existentes

- Administrador.
- Coordinador.
- Formador.
- Padres.

Hay que revisar los permisos existentes y adaptarlos a los nuevos procesos, sin crear roles duplicados.

Cada rol debe acceder únicamente a la información y las acciones que necesita para su trabajo.

## 12. Prioridades de implementación

**Prioridad 1. Completar el circuito de matching**

- Revisar lo que ya funciona.
- Añadir el enlace de WhatsApp con mensaje preparado.
- Mejorar las notificaciones.
- Registrar respuestas.
- Facilitar la solicitud de llamadas.

**Prioridad 2. Completar el panel de selección**

- Mostrar candidatos y respuestas.
- Registrar entrevistas.
- Seleccionar al mentor.
- Identificar un sustituto cuando corresponda.
- Diferenciar entre no seleccionado para una asignación y excluido del equipo.

**Prioridad 3. Adaptar la ficha de asignación**

- Generación de la ficha.
- Cumplimentación por el mentor.
- Firma.
- Almacenamiento.
- Comprobación de documentación pendiente.

**Prioridad 4. Diseñar el portal de familias**

- Acceso progresivo.
- Formularios.
- Estado de incorporación.
- Propuesta.
- Pago.
- Tareas pendientes.

**Prioridad 5. Centralizar documentos y datos**

- Revisar la arquitectura existente.
- Evitar duplicidades.
- Ajustar permisos por rol.

**Prioridad 6. Automatizar pagos y coordinación**

- Recordatorios.
- Confirmación de pagos.
- Registro contable.
- Horarios.
- Llamadas.

**Prioridad 7. Formalizar el inicio**

- Lista de comprobación.
- Entrega del kit.
- Activación del servicio.

## 13. Método de trabajo para el desarrollo

Este documento describe el proceso deseado; no certifica que sus funcionalidades estén implementadas.

Antes de modificar código, el responsable del desarrollo debe:

1. Revisar el estado real del repositorio, la base de datos y los paneles existentes.
2. Identificar qué funciona, qué está parcialmente implementado y qué falta.
3. Relacionar cada requisito con los componentes actuales.
4. Detectar dependencias, riesgos y duplicidades.
5. Establecer un plan de implementación por prioridades.
6. Implementar los cambios progresivamente.
7. Probar permisos, persistencia y funcionamiento.
8. Registrar lo terminado, lo pendiente y los problemas detectados.

Se deben minimizar los cambios innecesarios y agrupar los despliegues compatibles, sin sacrificar las pruebas de seguridad.

## Resultado final esperado

Un campus en el que:

- Las familias completan su incorporación desde su espacio privado.
- Los mentores consultan y responden a oportunidades de asignación.
- El administrador o coordinador gestiona candidatos, entrevistas y decisiones desde un panel.
- La ficha de asignación se completa y firma dentro de la plataforma.
- Los pagos, horarios y llamadas tienen estados claros.
- Las notificaciones reducen la necesidad de seguimiento manual.
- La fundadora puede delegar progresivamente la coordinación sin perder visibilidad del negocio.
- La información se mantiene centralizada, segura y preparada para escalar.
