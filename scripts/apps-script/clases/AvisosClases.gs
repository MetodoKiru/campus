/**
 * Método Kiru · Correos de cambios, cancelaciones y recuperaciones de clases.
 *
 * Va en el mismo proyecto de Apps Script que «AccesoCampus» y «AvisosFamilias»
 * (hoja «Solicitud mentores (respuestas)»). Usa la misma clave KIRU_ALTA_SECRET
 * y las funciones kiruEscapar y KIRU_REMITENTE de ese proyecto: no hay que
 * añadir ninguna propiedad.
 *
 * Cada 5 minutos pregunta al campus si hay avisos de clases para mentores,
 * coordinadores, administración o familias y manda un correo por aviso. El
 * campus marca cada aviso como enviado al entregarlo: un correo nunca se repite.
 *
 * Para ponerlo en marcha: ejecuta una vez «kiruInstalarAvisosClases».
 */

var KIRU_AVISOS_CLASES_URL = 'https://campus.metodokiru.es/api/avisos/clases';

function kiruEnviarAvisosClases() {
  var clave = PropertiesService.getScriptProperties().getProperty('KIRU_ALTA_SECRET');
  if (!clave) throw new Error('Falta la propiedad KIRU_ALTA_SECRET.');
  var r = UrlFetchApp.fetch(KIRU_AVISOS_CLASES_URL, {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + clave },
    payload: '{}', muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error('El campus respondió ' + r.getResponseCode() + ': ' + r.getContentText());
  (JSON.parse(r.getContentText()).avisos || []).forEach(function (a) {
    try {
      kiruEnviarCorreoAvisoClase(a);
    } catch (e) {
      console.error('Aviso de clase para ' + a.email + ': ' + e.message);
    }
  });
}

function kiruEnviarCorreoAvisoClase(a) {
  var pila = String(a.name || '').trim().split(/\s+/)[0] || '';
  var asunto = 'Método Kiru | ' + a.title;
  var boton = a.role === 'padre' ? 'Ver en el campus' : 'Abrir mi panel';
  var html = '<p>Hola' + (pila ? ' ' + kiruEscapar(pila) : '') + ':</p>' +
    '<div style="margin:20px 0;padding:18px;border-radius:12px;background:#F3EFE6">' +
    '<p style="margin:0 0 8px;font-size:17px"><strong>' + kiruEscapar(a.title) + '</strong></p>' +
    '<p style="margin:0">' + kiruEscapar(a.body) + '</p></div>' +
    '<p style="margin:20px 0"><a href="' + kiruEscapar(a.url) + '" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#242321;color:#FFFFFF;text-decoration:none;font-weight:bold">' +
    boton + '</a></p>' +
    '<p style="font-size:12px;color:#64748B">Entra con tu usuario y PIN. Este aviso también aparece en la campanita del campus (arriba a la derecha).</p>' +
    '<p>Un saludo,<br>Equipo Método Kiru</p>';
  var texto = 'Hola' + (pila ? ' ' + pila : '') + ':\n\n' + a.title + '\n' + a.body + '\n\nEntra en ' + a.url + ' con tu usuario y PIN.\n\nEquipo Método Kiru';
  GmailApp.sendEmail(a.email, asunto, texto, { htmlBody: html, name: KIRU_REMITENTE });
}

/** Ejecútalo una vez: crea la revisión cada 5 minutos (no toca los demás disparadores). */
function kiruInstalarAvisosClases() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'kiruEnviarAvisosClases') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('kiruEnviarAvisosClases').timeBased().everyMinutes(5).create();
  kiruEnviarAvisosClases();
  console.log('Instalado: los avisos de clases se enviarán cada 5 minutos.');
}
