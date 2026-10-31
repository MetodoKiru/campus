# Propuestas de alumnos a mentores (Entrega 1 del Flujo Maestro)

Fecha: 31/10/2026. Prioridad 1 del Flujo Maestro: completar el circuito de
matching sin crear un segundo circuito. El match, el correo al mentor y los
botones Sí / Ajustar / No siguen siendo los del Apps Script «Kiru filtro
candidatos» (`MetodoKiru/sistema`, `candidatos/`). El campus guarda una copia,
la enseña a administración y coordinación, y apunta lo que hacen.

**No está desplegado.** Falta revisarlo y probarlo con Sofía (ver «Cómo se
prueba»).

## Diagnóstico (31/10/2026)

- `KIRU_OFERTAS_SECRET` está en Vercel (producción y preview) desde el 30/10.
- La hoja OFERTAS de «Familias Kiru (respuestas)» está **vacía**: nunca se ha
  pulsado «Contactar» en un correo de match. Cada camino del script apunta ahí
  (enviada, en cola, sí, no, ajustar), así que no se ha mandado ninguna oferta
  a un mentor, ni antes ni después del 30/10.
- Sí hay 3 correos de match a metodokiru@gmail.com (20/10 y 26/10).
- La copia del script en `sistema` no llamaba a `/api/ofertas`: no hay ningún
  `UrlFetchApp` hacia el campus. El proyecto del script está dentro de la hoja
  y no se puede abrir desde fuera, así que no se ha podido comparar con la
  versión real. Vercel (plan Hobby) solo guarda una hora de registros, por lo
  que no hay rastro de intentos antiguos.
- Conclusión: el campus no tiene propuestas porque no se ha enviado ninguna y,
  además, el script no estaba conectado. Esta entrega añade esa conexión.

## Qué cambia

### Privacidad

- El código de oferta era `match|<nombre del alumno>|<id de Jotform>` y viajaba
  en los enlaces del correo del mentor (firmados, pero se pueden leer). Ahora es
  `OF-` + 20 cifras hexadecimales (`codigoOferta_`), sin ningún dato del alumno.
  Los enlaces de correos antiguos siguen funcionando.
- La zona que ve el mentor es solo el municipio. Antes incluía el nombre de la
  calle.
- El mentor ya no puede leer `kiru_assignment_offers` directamente (se quita su
  rama de la política RLS). Su panel la lee a través de `/api/mentor/panel`, que
  solo devuelve curso, perfil, zona, intensidad, franjas y su respuesta. Nunca
  recibe el código, los enlaces ni el nombre del alumno.
- La base rechaza cualquier código que no sea `OF-…` (restricción CHECK) y
  `/api/ofertas` también lo rechaza.
- El nombre del alumno (`student_label`) solo lo leen administración y el
  coordinador del mentor contactado.

### Estados

| Estado | Cuándo |
| --- | --- |
| Esperando respuesta | Enviada hace menos de 72 h, sin respuesta |
| Sin respuesta | 72 h desde el envío sin respuesta (se calcula, no se guarda) |
| Disponible / Propone otro horario / No disponible | Respuesta del mentor (correo o panel) |
| Llamada solicitada / Llamada hecha | Acción del responsable, con nota del resultado |
| Seleccionado / Sustituto previsto / No seleccionado para este alumno | Decisión del responsable |
| Cerrada | El responsable la cierra. El mentor ya no puede responder |

- Se puede mandar un recordatorio en cualquier momento antes de cerrar. Al
  cerrar una propuesta sin respuesta y sin recordatorio, el panel pide
  confirmación.
- Solo un seleccionado por alumno (lo impide la base de datos).
- «No seleccionado» se guarda en la propuesta, nunca en el perfil: el mentor
  sigue activo y recibe otras propuestas.
- Cada cambio queda en `kiru_assignment_offer_events` (qué, quién, cuándo).

### Panel «Propuestas»

- `/admin` → pestaña «Propuestas a mentores»: todas.
- `/coordinador` → pestaña «Propuestas de alumnos»: solo las de sus mentores.
  Puede hacer las mismas acciones sobre ellas (rutas de servidor, comprobando
  el enlace coordinador–mentor). Sigue sin crear usuarios ni asignar alumnos.
- Por alumno: mentores contactados, respuesta, alternativa horaria, plazo,
  recordatorio, llamada, decisión, seleccionado y sustituto, e historial.
- La asignación definitiva sigue siendo «Enlazar Mentor y Alumno» en `/admin`
  (Fase 6, fuera de esta entrega).

### WhatsApp (sin API, se envía a mano)

Los botones abren `wa.me/<teléfono del mentor>` con el texto ya escrito. La
persona lo revisa en WhatsApp y lo envía. El teléfono llega del script (hoja
«Solicitud mentores»); si no hay, se usa el de la ficha de incorporación.
Los textos solo dicen curso y municipio:

1. **Nueva propuesta** (también como botón «WhatsApp» en el correo de match, junto a «Contactar»):
   > Hola Paula, te escribimos de Método Kiru. Te acabamos de enviar un correo con un posible alumno (2 ESO, Majadahonda) que podría encajar contigo. ¿Puedes mirarlo y responder desde el correo o desde tu panel del campus (menú ☰ → Asignación de alumnos)? Si no te encaja, pulsar «No puedo» también nos ayuda. ¡Gracias!
2. **Recordatorio**:
   > Hola Paula, te escribimos de Método Kiru. Hace unos días te enviamos una propuesta con un posible alumno (2 ESO, Majadahonda) y todavía no tenemos tu respuesta. ¿Puedes contestar hoy desde el correo o desde tu panel del campus? Si no te encaja, pulsa «No puedo» y buscamos otra opción. ¡Gracias!
3. **Llamada de 10 minutos** (solo si respondió Disponible o Propone otro horario):
   > Hola Paula, gracias por responder a la propuesta de alumno (2 ESO, Majadahonda). Antes de confirmar la asignación nos gustaría hablar contigo unos 10 minutos. ¿Qué día y hora te vienen bien esta semana?

Los textos están en `lib/assignment-offers.ts` (`whatsappText`) y el primero
también en `OfertaMentor.js` (`textoWhatsAppNueva_`).

## Archivos

- Migración `20261031120000_assignment_offers_followup_and_privacy.sql`: solo
  añade columnas a `kiru_assignment_offers`, la tabla de historial y cambia su
  política de lectura. No toca otras tablas.
- `app/api/propuestas` (GET) y `app/api/propuestas/[id]` (POST): panel y acciones.
- `app/api/ofertas`: código opaco obligatorio, nombre/teléfono del mentor,
  historial.
- `app/api/mentor/ofertas/[id]`: no deja responder a una propuesta cerrada; historial.
- `components/offers/OffersPanel.tsx`, `lib/assignment-offers.ts`.
- `supabase/tests/rls_roles_test.sql`: 14 pruebas nuevas (el mentor no lee la
  tabla, el coordinador solo ve lo suyo, formador y padre no ven nada, nadie
  escribe desde el navegador, el código con nombre se rechaza, un solo seleccionado).

## Cómo se prueba (antes de producción)

Nada de esto está aplicado. Orden propuesto, cada paso con el visto bueno de Sofía:

1. **Revisar el PR sin fusionarlo.** Fusionar a `main` despliega en producción.
2. **Aplicar la migración en Supabase.** Es compatible con el código que hay
   hoy en producción: solo añade columnas y una tabla, el panel del mentor ya
   lee por la API y la tabla de propuestas está vacía.
3. **Probar en la vista previa de Vercel del PR** (usa la misma base). Con un
   mentor de prueba y el correo propio: enviar una oferta de prueba a
   `/api/ofertas`, verla en «Propuestas», responder desde el panel del mentor,
   WhatsApp, recordatorio, llamada, seleccionar y cerrar.
4. **Apps Script** «Kiru filtro candidatos»: comparar `OfertaMentor.js` y
   `MatchFamilias.js` con los de `sistema` antes de pegarlos (puede haber
   cambios hechos directamente en Apps Script). Añadir en Propiedades del
   script `KIRU_OFERTAS_SECRET` (la misma de Vercel) y, para probar contra la
   vista previa, `CAMPUS_URL`. Ejecutar `probarConexionCampus()` y
   `instalarSyncCampus()`, y actualizar la implementación web a la versión nueva.
5. Prueba de punta a punta: match → «Contactar» → llega al campus → responder
   desde el correo → aparece la respuesta.
6. Fusionar el PR (producción) y quitar `CAMPUS_URL` si se puso.
