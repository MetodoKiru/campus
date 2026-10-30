/**
 * Método Kiru · Acceso al Campus para los mentores nuevos.
 *
 * Va dentro de la hoja «Solicitud mentores (respuestas)», en el mismo proyecto
 * de Apps Script «Kiru filtro candidatos»: Extensiones → Apps Script → «+» →
 * Script → llámalo «AccesoCampus» y pega este archivo entero. No cambia nada
 * de lo que ya hace el script.
 *
 * Qué hace:
 *  - Pide al campus la cuenta del mentor (la crea si no existe; nunca duplica)
 *    y un enlace «Crea tu PIN» de un solo uso que vale 14 días.
 *  - Ese enlace se mete en el correo de bienvenida (ver kiruAccesoParaCorreo).
 *  - Red de seguridad: cada hora mira la pestaña «Incorporación». Si a alguien
 *    ya le salió la BIENVENIDA y su ACCESO PLATAFORMA está vacío, le manda un
 *    correo corto con su acceso y lo apunta.
 *  - Añade el menú «Campus Kiru» → «Reenviar acceso a la fila seleccionada».
 *  - PIN olvidado: cada 5 minutos recoge del campus a quien ha pulsado
 *    «¿Has olvidado tu PIN?» y le manda el correo con un botón para crear uno
 *    nuevo. Nadie de Método Kiru tiene que hacer nada.
 *
 * Antes de usarlo, en Apps Script → Configuración del proyecto (rueda) →
 * Propiedades del script, añade:
 *   KIRU_ALTA_SECRET = (la clave que te pasa Claude, la misma que está en Vercel)
 * Después ejecuta una vez «kiruInstalarAccesoCampus» y acepta los permisos.
 */

var KIRU_ALTA_URL = 'https://campus.metodokiru.es/api/mentores/acceso';
var KIRU_PINS_URL = 'https://campus.metodokiru.es/api/mentores/acceso/pendientes';
var KIRU_PESTANA_INCORPORACION = 'Incorporación';
var KIRU_REMITENTE = 'Método Kiru';

// ===== Lo que usa el correo de bienvenida =====

/**
 * Úsalo dentro de la función que envía el correo de bienvenida, justo antes de
 * enviarlo, y mete lo que devuelve en el cuerpo HTML del correo:
 *
 *   var acceso = kiruAccesoParaCorreo(nombre, correo, telefono);
 *   htmlBody = htmlBody + acceso.html;   // o donde quieras que aparezca el botón
 *
 * Si el campus no responde, devuelve un bloque vacío y no frena el correo: la
 * red de seguridad le mandará el acceso en la siguiente hora.
 */
function kiruAccesoParaCorreo(nombre, correo, telefono) {
  try {
    var acceso = kiruAccesoCampus(nombre, correo, telefono, false);
    kiruApuntarAcceso(correo, acceso);
    return { html: kiruBloqueAccesoHtml(acceso), texto: kiruBloqueAccesoTexto(acceso), acceso: acceso };
  } catch (e) {
    console.error('Acceso al campus para ' + correo + ': ' + e.message);
    return { html: '', texto: '', acceso: null };
  }
}

/** Llama al campus. Devuelve { status, username, accessUrl, expiresAt, loginUrl }. */
function kiruAccesoCampus(nombre, correo, telefono, enlaceNuevo) {
  var clave = PropertiesService.getScriptProperties().getProperty('KIRU_ALTA_SECRET');
  if (!clave) throw new Error('Falta la propiedad KIRU_ALTA_SECRET (Configuración del proyecto → Propiedades del script).');
  var respuesta = UrlFetchApp.fetch(KIRU_ALTA_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + clave },
    payload: JSON.stringify({
      fullName: String(nombre || '').trim(),
      email: String(correo || '').trim(),
      phone: telefono ? String(telefono) : '',
      newLink: enlaceNuevo === true,
    }),
    muteHttpExceptions: true,
  });
  var codigo = respuesta.getResponseCode();
  var datos = {};
  try { datos = JSON.parse(respuesta.getContentText()); } catch (e) {}
  if (codigo !== 200 && codigo !== 201) throw new Error('El campus respondió ' + codigo + ': ' + (datos.error || respuesta.getContentText()));
  return datos;
}

function kiruEscapar(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function kiruBloqueAccesoHtml(acceso) {
  var usuario = '<strong style="font-family:monospace;font-size:16px">' + kiruEscapar(acceso.username) + '</strong>';
  if (!acceso.accessUrl) {
    return '<div style="margin:24px 0;padding:16px;border-radius:12px;background:#F3EFE6">' +
      '<p style="margin:0 0 8px"><strong>Tu acceso al Campus Kiru</strong></p>' +
      '<p style="margin:0">Entra en <a href="' + kiruEscapar(acceso.loginUrl) + '">campus.metodokiru.es</a> con tu usuario ' + usuario + ' y tu PIN.</p></div>';
  }
  var caduca = Utilities.formatDate(new Date(acceso.expiresAt), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  return '<div style="margin:24px 0;padding:20px;border-radius:12px;background:#F3EFE6">' +
    '<p style="margin:0 0 8px"><strong>Tu acceso al Campus Kiru</strong></p>' +
    '<p style="margin:0 0 16px">Tu usuario es ' + usuario + '. Pulsa el botón, elige un PIN de 6 números y ya estarás dentro.</p>' +
    '<p style="margin:0 0 16px"><a href="' + kiruEscapar(acceso.accessUrl) + '" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#0F172A;color:#FFFFFF;text-decoration:none;font-weight:bold">Crear mi PIN y entrar</a></p>' +
    '<p style="margin:0;font-size:12px;color:#64748B">El botón solo sirve una vez y caduca el ' + caduca + '. Después entrarás siempre en campus.metodokiru.es con tu usuario y tu PIN. No reenvíes este correo.</p></div>';
}

function kiruBloqueAccesoTexto(acceso) {
  if (!acceso.accessUrl) return 'Tu acceso al Campus Kiru: entra en ' + acceso.loginUrl + ' con tu usuario ' + acceso.username + ' y tu PIN.';
  return 'Tu acceso al Campus Kiru. Tu usuario es ' + acceso.username + '. Abre este enlace, elige un PIN de 6 números y ya estarás dentro: ' +
    acceso.accessUrl + ' (solo sirve una vez y caduca en 14 días).';
}

// ===== Pestaña «Incorporación» =====

function kiruColumnas(hoja) {
  var cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(function (c) { return String(c).trim().toUpperCase(); });
  var col = function (nombre) { return cab.indexOf(nombre); };
  var c = { nombre: col('NOMBRE'), correo: col('CORREO'), bienvenida: col('BIENVENIDA ENVIADA'), acceso: col('ACCESO PLATAFORMA') };
  if (c.nombre < 0 || c.correo < 0 || c.bienvenida < 0 || c.acceso < 0) {
    throw new Error('En «' + KIRU_PESTANA_INCORPORACION + '» faltan las columnas NOMBRE, CORREO, BIENVENIDA ENVIADA o ACCESO PLATAFORMA.');
  }
  return c;
}

function kiruTextoAcceso(acceso) {
  var hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  return acceso.accessUrl ? acceso.username + ' · enlace enviado ' + hoy : acceso.username + ' · ya entra';
}

/** Apunta el usuario en ACCESO PLATAFORMA de la fila con ese correo (si la hay). */
function kiruApuntarAcceso(correo, acceso) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KIRU_PESTANA_INCORPORACION);
  if (!hoja || hoja.getLastRow() < 2) return;
  var c = kiruColumnas(hoja);
  var valores = hoja.getRange(2, 1, hoja.getLastRow() - 1, hoja.getLastColumn()).getValues();
  var buscado = String(correo).trim().toLowerCase();
  for (var i = 0; i < valores.length; i++) {
    if (String(valores[i][c.correo]).trim().toLowerCase() === buscado) {
      hoja.getRange(i + 2, c.acceso + 1).setValue(kiruTextoAcceso(acceso));
      return;
    }
  }
}

function kiruEnviarCorreoAcceso(nombre, correo, acceso) {
  var pila = String(nombre).trim().split(/\s+/)[0];
  var html = '<p>Hola ' + kiruEscapar(pila) + ':</p>' +
    '<p>Ya tienes tu cuenta en el Campus Kiru, la plataforma donde verás a tu alumno, sus tareas y tus registros.</p>' +
    kiruBloqueAccesoHtml(acceso) +
    '<p>Si tienes cualquier problema para entrar, responde a este correo.</p><p>Un saludo,<br>Equipo Método Kiru</p>';
  GmailApp.sendEmail(correo, 'Método Kiru | Tu acceso al Campus', 'Hola ' + pila + ':\n\n' + kiruBloqueAccesoTexto(acceso) + '\n\nEquipo Método Kiru', {
    htmlBody: html,
    name: KIRU_REMITENTE,
  });
}

/**
 * Red de seguridad (cada hora): BIENVENIDA ENVIADA rellena y ACCESO PLATAFORMA
 * vacía → manda el correo de acceso y lo apunta. Espera 15 minutos desde la
 * bienvenida para no adelantarse al correo de bienvenida si ya lleva el botón.
 */
function kiruRevisarAccesosPendientes() {
  var bloqueo = LockService.getScriptLock();
  if (!bloqueo.tryLock(30000)) return;
  try {
    var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KIRU_PESTANA_INCORPORACION);
    if (!hoja || hoja.getLastRow() < 2) return;
    var c = kiruColumnas(hoja);
    var valores = hoja.getRange(2, 1, hoja.getLastRow() - 1, hoja.getLastColumn()).getValues();
    var haceUnRato = new Date(Date.now() - 15 * 60 * 1000);
    var fallos = [];
    for (var i = 0; i < valores.length; i++) {
      var fila = valores[i];
      var nombre = String(fila[c.nombre]).trim();
      var correo = String(fila[c.correo]).trim();
      var bienvenida = fila[c.bienvenida];
      if (!nombre || !correo || !bienvenida || bienvenida === false || String(fila[c.acceso]).trim()) continue;
      if (bienvenida instanceof Date && bienvenida > haceUnRato) continue;
      try {
        var acceso = kiruAccesoCampus(nombre, correo, '', false);
        kiruEnviarCorreoAcceso(nombre, correo, acceso);
        hoja.getRange(i + 2, c.acceso + 1).setValue(kiruTextoAcceso(acceso));
      } catch (e) {
        fallos.push(nombre + ' (' + correo + '): ' + e.message);
      }
    }
    if (fallos.length) {
      GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Kiru · No se pudo dar acceso al campus',
        'No se pudo crear el acceso al campus de:\n\n' + fallos.join('\n') + '\n\nSe volverá a intentar en una hora.', { name: KIRU_REMITENTE });
    }
  } finally {
    bloqueo.releaseLock();
  }
}

// ===== PIN olvidado =====

/** Cada 5 minutos: manda el correo «Crea un PIN nuevo» a quien lo haya pedido en el campus. */
function kiruEnviarPinsOlvidados() {
  var clave = PropertiesService.getScriptProperties().getProperty('KIRU_ALTA_SECRET');
  if (!clave) throw new Error('Falta la propiedad KIRU_ALTA_SECRET.');
  var r = UrlFetchApp.fetch(KIRU_PINS_URL, {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + clave },
    payload: '{}', muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error('El campus respondió ' + r.getResponseCode() + ': ' + r.getContentText());
  var datos = JSON.parse(r.getContentText());
  (datos.resets || []).forEach(function (p) {
    try {
      kiruEnviarCorreoPinNuevo(p);
    } catch (e) {
      console.error('PIN nuevo para ' + p.email + ': ' + e.message);
    }
  });
}

function kiruEnviarCorreoPinNuevo(p) {
  var pila = String(p.fullName || '').trim().split(/\s+/)[0] || 'hola';
  var zona = Session.getScriptTimeZone();
  var caduca = Utilities.formatDate(new Date(p.expiresAt), zona, "dd/MM/yyyy 'a las' HH:mm");
  var html = '<p>Hola ' + kiruEscapar(pila) + ':</p>' +
    '<p>Nos has pedido un PIN nuevo para el Campus Kiru. Tu usuario es <strong style="font-family:monospace;font-size:16px">' + kiruEscapar(p.username) + '</strong>.</p>' +
    '<p style="margin:20px 0"><a href="' + kiruEscapar(p.accessUrl) + '" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#0F172A;color:#FFFFFF;text-decoration:none;font-weight:bold">Crear un PIN nuevo</a></p>' +
    '<p style="font-size:12px;color:#64748B">El botón solo sirve una vez y caduca el ' + caduca + '. Si no lo has pedido tú, ignora este correo: tu PIN actual sigue valiendo.</p>' +
    '<p>Un saludo,<br>Equipo Método Kiru</p>';
  var texto = 'Hola ' + pila + ':\n\nNos has pedido un PIN nuevo para el Campus Kiru. Tu usuario es ' + p.username +
    '.\nAbre este enlace para crearlo (solo sirve una vez y caduca el ' + caduca + '): ' + p.accessUrl +
    '\n\nSi no lo has pedido tú, ignora este correo: tu PIN actual sigue valiendo.\n\nEquipo Método Kiru';
  GmailApp.sendEmail(p.email, 'Método Kiru | Crea un PIN nuevo para el Campus', texto, { htmlBody: html, name: KIRU_REMITENTE });
}

// ===== Menú y puesta en marcha =====

function kiruMenuAccesoCampus() {
  SpreadsheetApp.getUi().createMenu('Campus Kiru')
    .addItem('Reenviar acceso a la fila seleccionada', 'kiruReenviarAccesoFilaSeleccionada')
    .addItem('Revisar accesos pendientes ahora', 'kiruRevisarAccesosPendientes')
    .addToUi();
}

/** En «Incorporación», con una celda de la fila del mentor seleccionada. */
function kiruReenviarAccesoFilaSeleccionada() {
  var ui = SpreadsheetApp.getUi();
  var hoja = SpreadsheetApp.getActiveSheet();
  if (hoja.getName() !== KIRU_PESTANA_INCORPORACION || hoja.getActiveRange().getRow() < 2) {
    ui.alert('Ve a la pestaña «' + KIRU_PESTANA_INCORPORACION + '» y selecciona una celda de la fila del mentor.');
    return;
  }
  var c = kiruColumnas(hoja);
  var filaN = hoja.getActiveRange().getRow();
  var fila = hoja.getRange(filaN, 1, 1, hoja.getLastColumn()).getValues()[0];
  var nombre = String(fila[c.nombre]).trim();
  var correo = String(fila[c.correo]).trim();
  if (!nombre || !correo) { ui.alert('A esa fila le falta el nombre o el correo.'); return; }
  if (ui.alert('¿Enviar a ' + nombre + ' (' + correo + ') un enlace nuevo para crear su PIN? El anterior dejará de valer.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  try {
    var acceso = kiruAccesoCampus(nombre, correo, '', true);
    kiruEnviarCorreoAcceso(nombre, correo, acceso);
    hoja.getRange(filaN, c.acceso + 1).setValue(kiruTextoAcceso(acceso));
    ui.alert('Enviado. Su usuario es ' + acceso.username + '.');
  } catch (e) {
    ui.alert('No se pudo: ' + e.message);
  }
}

/** Comprueba la clave sin crear ninguna cuenta. */
function kiruProbarAccesoCampus() {
  var clave = PropertiesService.getScriptProperties().getProperty('KIRU_ALTA_SECRET');
  if (!clave) throw new Error('Falta la propiedad KIRU_ALTA_SECRET.');
  var r = UrlFetchApp.fetch(KIRU_ALTA_URL, {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + clave },
    payload: JSON.stringify({}), muteHttpExceptions: true,
  });
  var codigo = r.getResponseCode();
  if (codigo === 400) console.log('Todo bien: el campus acepta la clave.');
  else if (codigo === 401) throw new Error('La clave no coincide con la de Vercel.');
  else throw new Error('El campus respondió ' + codigo + ': ' + r.getContentText());
}

/** Ejecútalo una vez (y otra vez si cambias este archivo): crea el menú, la revisión de cada hora y la de PIN olvidados cada 5 minutos. */
function kiruInstalarAccesoCampus() {
  kiruProbarAccesoCampus();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'kiruRevisarAccesosPendientes' || f === 'kiruMenuAccesoCampus' || f === 'kiruEnviarPinsOlvidados') ScriptApp.deleteTrigger(t);
  });
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('kiruMenuAccesoCampus').forSpreadsheet(libro).onOpen().create();
  ScriptApp.newTrigger('kiruRevisarAccesosPendientes').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('kiruEnviarPinsOlvidados').timeBased().everyMinutes(5).create();
  kiruRevisarAccesosPendientes();
  console.log('Instalado. Recarga la hoja para ver el menú «Campus Kiru».');
}
