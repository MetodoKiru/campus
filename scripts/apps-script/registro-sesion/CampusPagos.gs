/**
 * Método Kiru · Copia la pestaña «Pagos» al campus («Mis pagos» del mentor).
 *
 * Va en el mismo proyecto de Apps Script de la hoja «Registro de sesión
 * (respuestas)», junto al archivo «campus» que ya envía los registros. Usa la
 * misma clave KIRU_REGISTROS_SECRET (ya está en Propiedades del script).
 *
 * No cambia nada de la hoja: solo lee «Pagos» y la manda al campus. La columna
 * «Notas» NO se envía (es interna). Los importes son los de la hoja: el campus
 * no calcula nada.
 *
 * Instalación: pega este archivo con el nombre «CampusPagos», guarda y ejecuta
 * una vez «kiruInstalarPagosAlCampus» (acepta los permisos si los pide).
 * Desde entonces se copia sola cada hora y cada vez que llega un registro.
 */

var KIRU_PAGOS_URL = 'https://campus.metodokiru.es/api/registros/pagos';
var KIRU_PESTANA_PAGOS = 'Pagos';

function kiruEnviarPagosAlCampus() {
  var clave = PropertiesService.getScriptProperties().getProperty('KIRU_REGISTROS_SECRET');
  if (!clave) throw new Error('Falta la propiedad KIRU_REGISTROS_SECRET (Configuración del proyecto → Propiedades del script).');

  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KIRU_PESTANA_PAGOS);
  if (!hoja) throw new Error('No encuentro la pestaña «' + KIRU_PESTANA_PAGOS + '».');
  var valores = hoja.getDataRange().getValues();
  if (valores.length < 2) return;

  var zona = Session.getScriptTimeZone();
  var cabeceras = valores[0].map(function (c) { return String(c).trim(); });
  var filas = [];
  for (var i = 1; i < valores.length; i++) {
    if (!valores[i][0] || !valores[i][1]) continue; // sin mentor o sin alumno
    var fila = { _fila: i + 1 };
    for (var j = 0; j < cabeceras.length; j++) {
      var nombre = cabeceras[j];
      if (!nombre || /^notas/i.test(nombre)) continue; // «Notas» es interna: no sale de la hoja
      var v = valores[i][j];
      fila[nombre] = v instanceof Date ? Utilities.formatDate(v, zona, 'yyyy-MM-dd') : v;
    }
    filas.push(fila);
  }

  var respuesta = UrlFetchApp.fetch(KIRU_PAGOS_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + clave },
    payload: JSON.stringify({ rows: filas }),
    muteHttpExceptions: true,
  });
  var codigo = respuesta.getResponseCode();
  var texto = respuesta.getContentText();
  if (codigo !== 200) throw new Error('El campus respondió ' + codigo + ': ' + texto);
  var r = JSON.parse(texto);
  console.log('Pagos copiados al campus: ' + r.saved + (r.removed ? ', retirados: ' + r.removed : '') +
    (r.unmatched && r.unmatched.length ? '. Sin cuenta en el campus: ' + r.unmatched.join(', ') : ''));
}

/** Ejecútalo una sola vez: crea las copias automáticas y hace la primera. */
function kiruInstalarPagosAlCampus() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'kiruEnviarPagosAlCampus') ScriptApp.deleteTrigger(t);
  });
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('kiruEnviarPagosAlCampus').forSpreadsheet(libro).onFormSubmit().create();
  ScriptApp.newTrigger('kiruEnviarPagosAlCampus').timeBased().everyHours(1).create();
  kiruEnviarPagosAlCampus();
}
