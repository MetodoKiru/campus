# Auditoría del campus frente al Flujo Maestro

Fecha: 31/10/2026. Registro técnico separado del documento funcional
(`docs/Flujo_Maestro_Metodo_Kiru.md`). Aquí se apunta qué existe de verdad, qué
falta y en qué orden se propone hacerlo. **No se ha cambiado código ni base de
datos** para escribirlo.

## Qué se ha revisado

- Repositorio `MetodoKiru/campus` (rama `main`, commit `25bfe9d`): rutas de
  `app/`, rutas de servidor `app/api/`, `components/`, `lib/` y las 26
  migraciones de `supabase/migrations/`.
- Repositorio `MetodoKiru/sistema` (commit `4303d92`): Apps Script de
  candidatos (match, ofertas, incorporación), registro de sesión y contabilidad.
- Base de datos de producción (proyecto `metodo kiru`, eu-west-1), **solo
  lectura**: tablas, migraciones aplicadas y recuentos.

### Foto de producción (31/10/2026)

| Dato | Valor |
| --- | --- |
| Cuentas | 1 admin, 1 coordinador, 3 mentores, 2 padres, 4 alumnos, 0 formadores |
| Alumnos con mentor (`student_mentors`) | 4 |
| Propuestas en `kiru_assignment_offers` | **0** |
| Pagos en `kiru_payments` | 0 |
| Documentos / aceptaciones | 0 / 0 |
| Fichas de incorporación de mentor | 0 |
| Migraciones aplicadas | 26 (la última, `skillcoins_tienda`, figura como `20261030220414`; en el repo es `20261031090000`) |

Es decir: la estructura está, pero casi toda la operativa real sigue en las
hojas de Google y el correo.

## Cómo está montado hoy (resumen)

```
Jotform «Incorporación Método Kiru» ─► hoja «Familias Kiru (respuestas)» / FAMILIAS
                                           │ cada 15 min (MatchFamilias.gs)
Hoja «Solicitud mentores» (ACEPTADOS) ─────┤ puntúa zona, días, mates, perfil, categoría
                                           ▼
             Correo a metodokiru@gmail.com con el top 5 y botón «Contactar»
                                           │ (OfertaMentor.gs, web app firmada)
                                           ▼
     Correo anónimo «Posible alumno para ti» al mentor: Sí / Ajustar / No
                                           │
           Hoja OFERTAS + correo a Sofía  ◄┘   (Ajustar → Jotform aparte)

Campus: /api/ofertas (recibe ofertas y respuestas del script, clave KIRU_OFERTAS_SECRET)
        /mentor → menú ☰ → «Asignación de alumnos» (ver y responder)
        /api/mentor/ofertas/[id] → reenvía la respuesta al script por el mismo enlace firmado
```

Roles en la base (`profiles.role`): `admin`, `coordinador`, `formador`,
`mentor`, `padre`, `alumno`. **Ojo:** en el campus *formador* no es el mentor,
es quien incorpora mentores (certificado, confidencialidad, alta de cuenta). El
mentor es un rol propio. No hace falta crear ninguno nuevo.

## Brechas por fase

Leyenda: ✅ funciona · 🟡 parcial · ❌ falta

### Fase 1. Captación

| Requisito | Estado | Dónde está hoy |
| --- | --- | --- |
| Registrar familia potencial | ❌ | No hay entidad «familia» ni «alumno potencial». En el campus un alumno es una cuenta de Auth (`students.profile_id → profiles → auth.users`): no se puede guardar un interesado sin crearle usuario. |
| Estado comercial y siguiente acción | ❌ | Solo en la cabeza/WhatsApp de Sofía y la hoja «Contabilidad 26-27». |

### Fase 2. Portal de familias

| Requisito | Estado | Dónde está hoy |
| --- | --- | --- |
| Espacio privado del padre | 🟡 | `/padre`: hijos, avisos, SkillCoins, documentos (aceptar), pagos (solo ver). Pensado para familias **activas** con alumno ya creado. |
| Invitación por correo | 🟡 | Existe el mecanismo de enlace de un solo uso `/acceso` (`kiru_access_links`, `lib/server/access-links.ts`) pero solo se usa para mentores. Reutilizable. |
| Acceso progresivo por fase / 10 estados | ❌ | No hay campo de estado de incorporación. |
| Tareas pendientes de la familia | ❌ | `kiru_app_records` tiene `record_type = 'task'`, pero son tareas de estudio del alumno. |
| Notificar al responsable | 🟡 | `kiru_notifications` existe (campana, correo vía Apps Script), pero sus `kind` solo cubren SkillCoins. Ampliable. |

### Fase 3. Formularios y expediente

| Requisito | Estado | Dónde está hoy |
| --- | --- | --- |
| A. Incorporación | 🟡 | Jotform «Incorporación Método Kiru» → hoja FAMILIAS. Ya recoge alumno, curso, zona, dirección, disponibilidad, intensidad, asignatura, perfil con consentimiento de salud. No llega al campus. |
| B. Coordinación con colegio | ❌ | No encontrado en ningún repo. |
| C. Disponibilidad familiar para llamadas | ❌ | Solo la disponibilidad semanal para clases (dentro de A). |
| Expediente centralizado con permisos | ❌ | No hay tabla de expediente. Las políticas RLS ya tienen la pieza `kiru_private.can_view_student()` para limitar por mentor/familia/coordinador. |

### Fase 4. Matching y contacto con mentores — **Prioridad 1**

| Requisito | Estado | Dónde está hoy |
| --- | --- | --- |
| Identificar mentores compatibles | ✅ | `sistema/candidatos/MatchFamilias.js` (`puntuar_`). Lee mentores de la hoja «Solicitud mentores», no del campus. |
| Correo de propuesta al mentor | ✅ | `OfertaMentor.js` (`enviarOferta_`), anónimo, Sí/Ajustar/No, cola de fin de semana. |
| Copia de la propuesta en el campus | 🟡 | `kiru_assignment_offers` + `POST /api/ofertas` listos, **pero en producción hay 0 filas**: la versión de `OfertaMentor.js` guardada en `sistema` no llama a `/api/ofertas`. O falta ese trozo en el script real, o falta `KIRU_OFERTAS_SECRET`, o no se ha mandado ninguna oferta desde el 30/10. Hay que comprobarlo en Apps Script. |
| Mentor responde desde su panel | ✅ (código) | `components/mentor/MentorSteps.tsx` paso 4 + `/api/mentor/ofertas/[id]`. Sin uso real aún (0 ofertas). |
| Registrar «propone otro horario» | 🟡 | En el panel se guarda el detalle. Por correo, «Ajustar» manda a un Jotform aparte y la hoja OFERTAS solo apunta «QUIERE AJUSTAR». |
| Comprobar alternativa con disponibilidad familiar | ❌ | Manual. |
| «Sin respuesta» y seguimiento | ❌ | No hay recordatorio ni marca de plazo. |
| Enlace WhatsApp con mensaje preparado | ❌ | Solo enlaces fijos `wa.me/34651382833` (contacto general). El teléfono del mentor está en la hoja y en `kiru_mentor_onboarding.phone`. |
| Ver candidatos y respuestas en el panel admin/coordinador | ❌ | `/admin` y `/coordinador` no leen `kiru_assignment_offers` (la RLS ya les deja). Hoy se ve en el correo y en la hoja OFERTAS. |
| Solicitar llamada de 10 min | ❌ | No existe. |

### Fase 5. Panel de selección

| Requisito | Estado |
| --- | --- |
| Candidatos, contactados, respuestas, alternativas | ❌ (datos en `kiru_assignment_offers` sin pantalla) |
| Llamadas pendientes/realizadas y resultado | ❌ |
| Seleccionar mentor / sustituto | ❌ (hoy: «Enlazar Mentor y Alumno» en `/admin`, que exige que el alumno ya tenga cuenta) |
| No seleccionado ≠ excluido | ❌ (no hay ni lo uno ni lo otro como estado; dar de baja a un mentor es `is_active = false`, que sí lo excluye de todo) |

### Fase 6. Ficha de asignación

| Requisito | Estado | Dónde está hoy |
| --- | --- | --- |
| Documentos y «firma» | 🟡 | `kiru_documents` + `kiru_document_acceptances`: admin sube un PDF dirigido a un **alumno**; la familia pulsa «aceptar». No es firma con nombre ni dirigida a mentores. |
| Ficha prellenada que completa el mentor | ❌ | El correo del script dice «envíale la Ficha de asignación», pero no está en ningún repo. |
| Almacenamiento | 🟡 | Bucket privado `kiru-mentor-docs` (solo PDF, lo sube el servidor). Reutilizable. |
| Patrón de entrega + revisión | ✅ reutilizable | `kiru_mentor_steps` (enviado → en revisión → completado / requiere corrección) y `MentorStepsReview.tsx`. |

### Fase 7. Propuesta personalizada

❌ Plantilla de Canva fuera del sistema. `app/presupuesto.html` es un presupuesto
técnico del desarrollo, no la propuesta a familias.

### Fase 8. Pagos

| Requisito | Estado | Dónde está hoy |
| --- | --- | --- |
| Importe, enlace y fecha límite visibles | 🟡 | `kiru_payments` (admin crea, padre ve). 0 filas en producción. |
| Estados pendiente / declarado / verificado / vencido | ❌ | El CHECK solo admite `pending, paid, cancelled, refunded`. Falta «declarado» y quién/cuándo verificó. |
| Recordatorios | 🟡 | `sistema/contabilidad/Codigo.gs` (renovaciones: aviso a 7 días, recordatorio a 2, aviso a Sofía) sobre la hoja «Familias». Es la fuente real hoy. |
| Registro contable | 🟡 | Hoja «Contabilidad 26-27» + `Resumen.gs`. |

**Duplicidad a vigilar:** pagos en `kiru_payments` y en la hoja de contabilidad.
Hay que decidir cuál manda antes de automatizar.

### Fase 9. Clases y llamadas

| Requisito | Estado |
| --- | --- |
| Registro de sesiones | ✅ Formulario de Google → `kiru_session_logs` (Apps Script). |
| Horario de clases acordado | ❌ (pendiente desde el Sprint 3, `docs/rol-coordinador.md`) |
| Dos llamadas mensuales con fechas | 🟡 Paso 3 del mentor explica las llamadas; el formulario de llamadas está retirado hasta definir campos. |

### Fase 10. Kit e inicio

❌ No hay lista de comprobación. Casi todos sus puntos dependen de datos de
fases anteriores, así que va al final y saldría casi «gratis» si el expediente
existe.

### Fase 11. Centralización y permisos

- ✅ Base sólida: toda la autorización en RLS, rol doble comprobado
  (`profiles.role` + `app_metadata.kiru_role`), pruebas de aislamiento
  `supabase/tests/rls_roles_test.sql` en CI, escrituras sensibles por rutas de
  servidor.
- 🟡 La fuente de verdad de familias, mentores aceptados, ofertas y pagos sigue
  en Google Sheets. El campus tiene copias parciales.
- El coordinador hoy **no ve pagos** y no puede asignar (decisión del 25/10).
  Para que gestione asignaciones habrá que darle permisos de escritura
  acotados, por rutas de servidor, no abriendo la RLS.

## Riesgos detectados

1. **Nombre del menor en el código de la oferta.** `claveFamilia_()` genera
   `match|<nombre del alumno>|<id>`. Ese texto va (a) en el token del enlace
   del correo, que está firmado pero **no cifrado** (base64), y (b) en
   `kiru_assignment_offers.offer_code`, que el mentor puede leer de su propia
   fila con su sesión. La oferta se presenta como anónima, así que conviene
   cambiar el código por un identificador sin nombre antes de usar el circuito
   de verdad. Es lo primero que propongo arreglar.
2. **Puente script → campus sin confirmar** (0 ofertas en producción). Sin él,
   todo lo que se construya en el panel saldría vacío.
3. **Dos fuentes de verdad** (hojas y Supabase) para familias, mentores y
   pagos. Cada fase nueva debe decir cuál manda.
4. **Modelo de alumno = cuenta.** Para tener familias potenciales y
   expedientes antes de empezar hace falta una entidad nueva (expediente /
   familia) que más tarde se enlace con la cuenta del alumno. Es el cambio de
   datos más grande del plan; conviene diseñarlo una vez, en la Prioridad 4.
5. **Deriva de migraciones:** la de SkillCoins está en producción con otra
   versión que en el repo. No rompe nada hoy, pero `supabase db push` la
   intentaría aplicar de nuevo; hay que repararla.
6. El enlace firmado del script no caduca. Bajo riesgo, pero a tener en cuenta
   si se reenvían correos.

## Plan propuesto

Agrupado en entregas que se pueden desplegar juntas. Cada una con migración,
pruebas RLS y prueba de punta a punta antes de producción.

### Entrega 1 — Prioridad 1: circuito de matching (propuesta para empezar)

1. **Apps Script (`sistema/candidatos/OfertaMentor.js`)**
   - Código de oferta sin nombre del menor (por ejemplo, hash corto del Submission ID).
   - Tras `enviarOferta_` y tras cada respuesta por correo, enviar a
     `POST /api/ofertas` (incluido «Ajustar» con su detalle cuando llegue).
     Comprobar `KIRU_OFERTAS_SECRET` en Vercel y en las propiedades del script.
   - En el correo de match a Sofía, junto a «Contactar», un botón **WhatsApp**
     que abre `wa.me/<teléfono del mentor>?text=<mensaje preparado>`.
2. **Campus — migración pequeña sobre `kiru_assignment_offers`** (sin tabla nueva):
   estado de seguimiento del responsable (`sin_respuesta` tras N días,
   `llamada_solicitada`, `llamada_hecha` + nota), fecha y autor de cada cambio.
3. **Campus — pestaña «Propuestas»** en `/admin` (y lectura en `/coordinador`
   para sus mentores): agrupada por alumno, con cada mentor contactado, su
   respuesta, la alternativa horaria, días sin respuesta y botones
   «WhatsApp» (mensaje preparado, se envía a mano), «Correo» (`mailto:`) y
   «Solicitar llamada» (abre WhatsApp con el mensaje de llamada de 10 min y
   lo apunta).
4. **Avisos:** ampliar `kiru_notifications.kind` con «propuesta respondida» para
   que salga en la campana de admin/coordinador (el correo del script se
   mantiene).

Pruebas: RLS (el mentor no ve ofertas ajenas ni el nombre del alumno; el
coordinador solo las de sus mentores), una oferta de prueba de punta a punta
con el mentor de prueba.

### Entrega 2 — Prioridad 2: panel de selección

Sobre la misma pestaña: resultado de la llamada, «Seleccionado»,
«Sustituto» y «No seleccionado para este alumno» (decisión por oferta, nunca
en el perfil del mentor). Al seleccionar, las demás ofertas de ese alumno
pasan a «cerrada», y se avisa al resto si se decide así. El coordinador
podrá hacer estas acciones mediante una ruta de servidor con su permiso.

### Entrega 3 — Prioridad 3: ficha de asignación

Reutilizar el patrón de `kiru_mentor_steps` + `MentorStepsReview`: la
selección crea una ficha prellenada; el mentor la completa y firma (nombre +
casilla + fecha/IP, como el certificado) desde `/mentor`; se guarda en
`kiru-mentor-docs` y admin la revisa. Antes necesito el contenido de la ficha
actual.

### Entregas 4 a 7

4. **Portal de familias:** entidad expediente/familia con los 10 estados,
   invitación con el enlace de `/acceso`, formularios A/B/C (decidir si siguen
   en Jotform y se importan o pasan al campus), tareas pendientes. Es la pieza
   que más decisiones pide.
5. **Centralizar:** decidir fuente de verdad hoja ↔ campus por dato, ajustar RLS.
6. **Pagos y coordinación:** estados declarado/verificado con historial,
   recordatorios a partir de la lógica de `contabilidad/Codigo.gs`, horario de
   clases y llamadas.
7. **Inicio:** lista de comprobación calculada a partir de lo anterior y kit.

## Decisiones que necesito de Sofía

- Visto bueno para empezar la Entrega 1.
- Confirmar si el script real ya llama a `/api/ofertas` (o darme acceso para
  comprobarlo) y si ya hay ofertas enviadas después del 30/10.
- Texto del mensaje de WhatsApp al mentor y del de solicitud de llamada (puedo
  proponer uno).
- Días sin respuesta tras los que una propuesta cuenta como «sin respuesta».
