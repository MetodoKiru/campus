/**
 * Método Kiru · Envía los registros de sesión al campus.
 *
 * Va dentro de la hoja «Registro de sesión (respuestas)»:
 * Extensiones → Apps Script → «+» → Script → pégalo entero con el nombre
 * «Campus». No cambia nada de la hoja ni del formulario: solo lee la pestaña de
 * respuestas y la manda a campus.metodokiru.es.
 *
 * Antes de usarlo, en Apps Script → Configuración del proyecto (rueda) →
 * Propiedades del script, añade:
 *   KIRU_REGISTROS_SECRET = (la clave que te pasa Claude, la misma que está en Vercel)
 *
 * Después ejecuta una vez «kiruInstalarEnvioAutomatico» y acepta los permisos.
 * Desde ese momento cada respuesta nueva llega sola al campus, y cada hora se
 * repasa toda la hoja por si alguien ha corregido una respuesta.
 */

var KIRU_CAMPUS_URL = 'https://campus.metodokiru.es/api/registros/importar';
var KIRU_PESTANA_RESPUESTAS = 'Respuestas de formulario 1';

/** Manda todas las respuestas al campus. Se puede ejecutar a mano cuando quieras. */
function kiruEnviarRegistrosAlCampus() {
  var clave = PropertiesService.getScriptProperties().getProperty('KIRU_REGISTROS_SECRET');
  if (!clave) throw new Error('Falta la propiedad KIRU_REGISTROS_SECRET (Configuración del proyecto → Propiedades del script).');

  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KIRU_PESTANA_RESPUESTAS);
  if (!hoja) throw new Error('No encuentro la pestaña «' + KIRU_PESTANA_RESPUESTAS + '».');
  var valores = hoja.getDataRange().getValues();
  if (valores.length < 2) return;

  var zona = Session.getScriptTimeZone();
  var cabeceras = valores[0].map(function (c) { return String(c).trim(); });
  var filas = [];
  for (var i = 1; i < valores.length; i++) {
    if (!valores[i][0]) continue; // fila vacía: sin marca temporal
    var fila = {};
    for (var j = 0; j < cabeceras.length; j++) {
      if (!cabeceras[j]) continue;
      var v = valores[i][j];
      fila[cabeceras[j]] = v instanceof Date ? Utilities.formatDate(v, zona, "yyyy-MM-dd'T'HH:mm:ssXXX") : String(v);
    }
    filas.push(fila);
  }

  var respuesta = UrlFetchApp.fetch(KIRU_CAMPUS_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + clave },
    payload: JSON.stringify({ rows: filas }),
    muteHttpExceptions: true,
  });
  var codigo = respuesta.getResponseCode();
  var texto = respuesta.getContentText();
  if (codigo !== 200) throw new Error('El campus respondió ' + codigo + ': ' + texto);
  var resultado = JSON.parse(texto);
  console.log('Registros guardados en el campus: ' + resultado.saved +
    (resultado.unmatched && resultado.unmatched.length ? '. Sin reconocer: ' + resultado.unmatched.join(', ') : ''));
}

/** Ejecútalo una sola vez: crea los avisos automáticos y hace el primer envío. */
function kiruInstalarEnvioAutomatico() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'kiruEnviarRegistrosAlCampus') ScriptApp.deleteTrigger(t);
  });
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('kiruEnviarRegistrosAlCampus').forSpreadsheet(libro).onFormSubmit().create();
  ScriptApp.newTrigger('kiruEnviarRegistrosAlCampus').timeBased().everyHours(1).create();
  kiruEnviarRegistrosAlCampus();
}


/**
 * Importación inicial manual del horario semanal desde la pestaña «Horarios».
 * Ejecutar una sola vez cuando el endpoint del campus esté desplegado.
 * Después, el horario del campus será la referencia y no se debe repetir.
 */
function kiruImportarHorarioInicialAlCampus() {
  var clave = PropertiesService.getScriptProperties().getProperty('KIRU_REGISTROS_SECRET');
  if (!clave) throw new Error('Falta la propiedad KIRU_REGISTROS_SECRET.');
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Horarios');
  if (!hoja) throw new Error('No encuentro la pestaña «Horarios».');
  var valores = hoja.getDataRange().getDisplayValues();
  if (valores.length < 2) throw new Error('La pestaña Horarios no contiene filas.');
  var cabeceras = valores[0].map(function (c) { return String(c).trim(); });
  var indice = {};
  cabeceras.forEach(function (c, i) { indice[c.toLowerCase()] = i; });
  var requeridas = ['mentor (como en el formulario)', 'correo del mentor', 'alumno (como en el formulario)', 'día', 'inicio', 'fin', 'activo'];
  requeridas.forEach(function (c) {
    if (indice[c] === undefined) throw new Error('Falta la columna «' + c + '».');
  });
  var filas = valores.slice(1).filter(function (r) { return r.some(function (v) { return String(v).trim(); }); }).map(function (r) {
    return {
      mentor_name: r[indice['mentor (como en el formulario)']],
      mentor_email: r[indice['correo del mentor']],
      student_name: r[indice['alumno (como en el formulario)']],
      weekday: r[indice['día']],
      start_time: r[indice['inicio']],
      end_time: r[indice['fin']],
      active: r[indice['activo']]
    };
  });
  var respuesta = UrlFetchApp.fetch('https://campus.metodokiru.es/api/horarios/importar-inicial', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + clave },
    payload: JSON.stringify({ rows: filas }),
    muteHttpExceptions: true
  });
  var codigo = respuesta.getResponseCode();
  if (codigo !== 200) throw new Error('Importación no completada (' + codigo + '). Revisa el estado desde el campus.');
  var resultado = JSON.parse(respuesta.getContentText());
  console.log('Franjas semanales importadas: ' + resultado.imported);
}
