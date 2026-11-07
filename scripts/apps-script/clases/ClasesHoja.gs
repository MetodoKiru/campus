/**
 * Método Kiru · Copia del campus a las pestañas «Sin clase» y «Recuperaciones».
 *
 * Va en el proyecto de Apps Script de la hoja «Registro de sesión (respuestas)»,
 * junto a campus.gs (usa la misma propiedad KIRU_REGISTROS_SECRET). No hace falta
 * ningún activador nuevo: se ejecuta al final de cada envío horario de campus.gs
 * (línea añadida en kiruEnviarRegistrosAlCampus).
 *
 * Qué hace, sin intervención de nadie:
 *  - Pide al campus las cancelaciones, recuperaciones y días sin clase de Kiru
 *    que han cambiado.
 *  - Busca cada una por su «ID clase» (última columna). Si existe, actualiza
 *    esa fila; si no, adopta la fila escrita a mano de la misma fecha, mentor y
 *    alumno (solo le añade «Quién cancela» e «ID clase», sin tocar lo demás); si
 *    tampoco hay, la añade al final.
 *  - Nunca borra filas. Si algo se deshace en el campus, la fila se queda con la
 *    fecha vacía y el motivo «Anulado: …», para que los recordatorios la ignoren.
 *  - Confirma al campus fila a fila. Lo que falle se reintenta en la hora
 *    siguiente y el error queda registrado en el campus.
 *
 * Columnas: A-D de «Sin clase» y A-G de «Recuperaciones» no se mueven. Las
 * columnas «Quién cancela» e «ID clase» se crean al final si no existen.
 */

var KIRU_CLASES_URL = 'https://campus.metodokiru.es/api/hoja/clases';
var KIRU_HOJAS_CLASES = {
  sin_clase: { nombre: 'Sin clase', fijas: 4 },
  recuperaciones: { nombre: 'Recuperaciones', fijas: 7 },
};

function kiruCopiarClasesALaHoja() {
  var clave = PropertiesService.getScriptProperties().getProperty('KIRU_REGISTROS_SECRET');
  if (!clave) throw new Error('Falta la propiedad KIRU_REGISTROS_SECRET.');
  var cerrojo = LockService.getScriptLock();
  if (!cerrojo.tryLock(30000)) return; // ya hay otra copia en marcha
  try {
    var r = UrlFetchApp.fetch(KIRU_CLASES_URL, { headers: { Authorization: 'Bearer ' + clave }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('El campus respondió ' + r.getResponseCode() + ': ' + r.getContentText());
    var filas = JSON.parse(r.getContentText()).filas || [];
    if (!filas.length) return;

    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var hojas = {};
    var resultados = filas.map(function (f) {
      try {
        var destino = KIRU_HOJAS_CLASES[f.hoja];
        if (!destino) throw new Error('Pestaña desconocida: ' + f.hoja);
        if (!hojas[f.hoja]) hojas[f.hoja] = kiruPrepararHojaClases(libro, destino);
        kiruEscribirFilaClase(hojas[f.hoja], f.hoja, f.idClase, f.datos || {});
        return { id: f.id, version: f.version, ok: true };
      } catch (e) {
        console.error('Fila ' + f.idClase + ': ' + e.message);
        return { id: f.id, version: f.version, ok: false, error: e.message };
      }
    });
    SpreadsheetApp.flush();

    var c = UrlFetchApp.fetch(KIRU_CLASES_URL, {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + clave },
      payload: JSON.stringify({ resultados: resultados }), muteHttpExceptions: true,
    });
    if (c.getResponseCode() !== 200) throw new Error('El campus no recibió la confirmación (' + c.getResponseCode() + ').');
    console.log('Clases copiadas a la hoja: ' + resultados.filter(function (x) { return x.ok; }).length + ' de ' + resultados.length);
  } finally {
    cerrojo.releaseLock();
  }
}

/** Abre la pestaña y se asegura de que tiene «Quién cancela» e «ID clase» al final. */
function kiruPrepararHojaClases(libro, destino) {
  var hoja = libro.getSheetByName(destino.nombre);
  if (!hoja) throw new Error('No encuentro la pestaña «' + destino.nombre + '».');
  var ancho = Math.max(hoja.getLastColumn(), destino.fijas);
  var cab = hoja.getRange(1, 1, 1, ancho).getDisplayValues()[0].map(function (c) { return String(c).trim(); });
  var colQuien = cab.indexOf('Quién cancela') + 1;
  var colId = cab.indexOf('ID clase') + 1;
  var nuevas = (colQuien ? 0 : 1) + (colId ? 0 : 1);
  // La cuadrícula puede no tener columnas libres a la derecha («Sin clase» tiene 4).
  if (ancho + nuevas > hoja.getMaxColumns()) hoja.insertColumnsAfter(hoja.getMaxColumns(), ancho + nuevas - hoja.getMaxColumns());
  if (!colQuien) { colQuien = ancho + 1; hoja.getRange(1, colQuien).setValue('Quién cancela'); ancho = colQuien; }
  if (!colId) { colId = ancho + 1; hoja.getRange(1, colId).setValue('ID clase'); }
  return { hoja: hoja, fijas: destino.fijas, colQuien: colQuien, colId: colId };
}

function kiruEscribirFilaClase(h, tipo, id, d) {
  var hoja = h.hoja;
  var ultima = hoja.getLastRow();
  var fila = 0;
  if (ultima >= 2) {
    var ids = hoja.getRange(2, h.colId, ultima - 1, 1).getDisplayValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === id) { fila = i + 2; break; }
  }
  // Las fechas se escriben como fecha (no texto), igual que las filas a mano.
  var fijas = tipo === 'sin_clase'
    ? [d.anulada ? '' : kiruAFecha(d.fecha), d.mentor, d.alumno, d.anulada ? 'Anulado: ' + (d.motivo || '') : d.motivo]
    : [kiruAFecha(d.fecha_original), d.mentor, d.alumno, d.anulada ? '' : kiruAFecha(d.fecha_recuperacion), d.hora_inicio, d.hora_fin, d.nota];

  if (!fila && ultima >= 2) {
    // Fila escrita a mano antes de que existiera el campus: se adopta, no se duplica.
    fila = kiruBuscarFilaAMano(hoja, h, ultima, d.fecha || d.fecha_original, d.mentor, d.alumno);
    if (fila) {
      hoja.getRange(fila, h.colQuien).setValue(d.quien_cancela || '');
      hoja.getRange(fila, h.colId).setValue(id);
      return;
    }
  }
  if (!fila) fila = ultima + 1;
  hoja.getRange(fila, 1, 1, h.fijas).setValues([fijas]);
  hoja.getRange(fila, h.colQuien).setValue(d.quien_cancela || '');
  hoja.getRange(fila, h.colId).setValue(id);
}

function kiruBuscarFilaAMano(hoja, h, ultima, fecha, mentor, alumno) {
  var valores = hoja.getRange(2, 1, ultima - 1, Math.max(h.colId, 3)).getValues();
  var m = kiruPrimerNombre(mentor), a = kiruPrimerNombre(alumno), f = kiruFechaIso(fecha);
  if (!f) return 0;
  for (var i = 0; i < valores.length; i++) {
    var v = valores[i];
    if (String(v[h.colId - 1]).trim()) continue; // ya tiene ID: no es «a mano»
    if (kiruFechaIso(v[0]) === f && kiruPrimerNombre(v[1]) === m && kiruPrimerNombre(v[2]) === a) return i + 2;
  }
  return 0;
}

function kiruPrimerNombre(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/)[0] || '';
}

/** Fecha de la hoja (Date) o del campus («dd/mm/aaaa» o «aaaa-mm-dd») → «aaaa-mm-dd» en Madrid. */
function kiruFechaIso(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Madrid', 'yyyy-MM-dd');
  var t = String(v || '').trim(), m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}

/** «dd/mm/aaaa» → Date de ese día a mediodía (evita saltos por zona horaria); vacío si no hay fecha. */
function kiruAFecha(v) {
  var iso = kiruFechaIso(v);
  if (!iso) return '';
  var p = iso.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2], 12);
}
