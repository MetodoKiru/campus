/**
 * Método Kiru · Alta automática de familias en el Campus.
 *
 * Va en el proyecto de Apps Script «Kiru filtro candidatos», junto a
 * AccesoCampus (usa su KIRU_ALTA_SECRET, kiruEscapar y KIRU_REMITENTE):
 * Extensiones → Apps Script → «+» → Script → llámalo «AltaFamilias» y pega
 * este archivo entero. No cambia nada de lo que ya hace el script.
 *
 * Qué hace, cada 10 minutos (también en fin de semana):
 *  1. Mira la pestaña FAMILIAS de «Familias Kiru (respuestas)» (la rellena
 *     Jotform) y coge las respuestas nuevas o pendientes.
 *  2. Si la familia autorizó crear la cuenta en la Plataforma Kiru y están los
 *     datos obligatorios, pide al campus la cuenta del alumno y una de familia
 *     por cada tutor con correo, enlazadas con el alumno. Si un tutor ya tiene
 *     cuenta de familia (un hermano), se reutiliza y solo se enlaza.
 *  3. Manda a cada tutor nuevo su usuario y el botón «Crear mi PIN y entrar».
 *     El acceso del alumno (que no tiene correo) va en el correo del primer
 *     tutor. Un tutor que ya tenía cuenta recibe solo un aviso.
 *  4. Manda a metodokiru@gmail.com un resumen con lo hecho y lo pendiente.
 *
 * Cada envío se controla por separado: en cuanto un correo sale bien, queda
 * apuntado (Propiedades del script, «altaFamEnv|nº de envío»). Si Gmail falla
 * con uno, en la siguiente pasada se pide al campus un enlace nuevo SOLO para
 * ese tutor; el enlace que ya recibió el otro no se toca nunca.
 *
 * Columnas que añade a la hoja:
 *  - CAMPUS ALTA, el estado de la familia:
 *      PENDIENTE · falta …        no se ha creado nada; falta un dato obligatorio
 *      SIN AUTORIZACIÓN           la familia no autorizó crear la cuenta
 *      REVISIÓN MANUAL · …        ya hay un alumno con ese nombre (ver abajo)
 *      CUENTAS CREADAS · …        cuentas hechas, pero algún correo no ha salido
 *      ALTA PARCIAL · …           alumno y un tutor dados de alta; falta el correo del otro
 *      ACCESO ENVIADO             todo hecho y todos los correos enviados
 *      CUENTA ENLAZADA · …        los tutores ya tenían acceso; solo se les avisó
 *      ERROR · …                  error del campus; vaciar la casilla para reintentar
 *  - CAMPUS CUENTAS: usuarios creados o enlazados.
 *  - CAMPUS ID ALUMNO: el id que pide la pestaña Familias de Contabilidad.
 * El alta NO activa el servicio: no asigna mentor, horario, clases ni pagos.
 *
 * REVISIÓN MANUAL: si ya hay en el campus un alumno con el mismo nombre, no se
 * crea nada. Sofía escribe en CAMPUS ID ALUMNO el id de ese alumno (si es el
 * mismo niño) o NUEVO (si es otro), y la siguiente pasada sigue sola.
 *
 * Además, en CAMPUS ALTA Sofía puede escribir:
 *  - REENVIAR: manda un acceso nuevo a todos los de la familia que aún no han
 *    entrado nunca (su enlace anterior deja de valer, pero reciben el nuevo).
 *  - OK: da la familia por cerrada aunque falte el correo de un tutor.
 *  - Nada (vaciarla): se vuelve a procesar; nunca duplica cuentas.
 *
 * Instalar (solo cuando se haya revisado todo): ejecuta una vez
 * «altaFamiliasInstalar» y acepta los permisos. Marca las respuestas que ya
 * están en la hoja como anteriores (no las toca) y crea el activador.
 */

var ALTA_FAM = {
  URL: 'https://campus.metodokiru.es/api/familias/alta',
  HOJA_ID: '1GvHUSsM3uVsEDB6m5vrG3dMVgDnRp3P1Bzr_jPLRtsU', // «Familias Kiru (respuestas)»
  PESTANA: 'FAMILIAS',
  COL_ESTADO: 'CAMPUS ALTA',
  COL_CUENTAS: 'CAMPUS CUENTAS',
  COL_ID: 'CAMPUS ID ALUMNO',
  AVISO: 'metodokiru@gmail.com',
  INTENTOS: 3,
};

// ===== Instalación =====

function altaFamiliasInstalar() {
  var hoja = altaFamHoja_();
  var cols = altaFamColumnas_(hoja);
  var ultima = hoja.getLastRow();
  if (ultima >= 2) {
    var datos = hoja.getRange(2, 1, ultima - 1, hoja.getLastColumn()).getValues();
    datos.forEach(function (fila, i) {
      if (fila.join('').trim() !== '' && String(fila[cols.estado] || '').trim() === '') {
        hoja.getRange(i + 2, cols.estado + 1).setValue('Anterior al alta automática');
      }
    });
  }
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'altaFamiliasRevisar'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('altaFamiliasRevisar').timeBased().everyMinutes(10).create();
}

// ===== Pasada periódica =====

function altaFamiliasRevisar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try { altaFamiliasRevisar_(); } finally { lock.releaseLock(); }
}

/**
 * Qué hacer con una fila según su estado:
 *  - 'nueva': vacía; 'reenviar': REENVIAR; 'reintento': correo que falló, se reintenta solo;
 *  - 'espera': pendiente de un dato; solo se vuelve a tratar si cambia la fila;
 *  - null: cerrada.
 */
function altaFamModo_(estado) {
  if (estado === '') return 'nueva';
  if (/^REENVIAR$/i.test(estado)) return 'reenviar';
  if (/^CUENTAS CREADAS · reintentando/i.test(estado)) return 'reintento';
  if (/^(PENDIENTE|REVISIÓN MANUAL|ALTA PARCIAL)/i.test(estado)) return 'espera';
  return null;
}

function altaFamiliasRevisar_() {
  var hoja = altaFamHoja_();
  var cols = altaFamColumnas_(hoja);
  if (hoja.getLastRow() < 2) return;
  var datos = hoja.getDataRange().getValues();
  var cab = datos[0].map(String);
  var props = PropertiesService.getScriptProperties();
  var resumen = [];
  for (var r = 1; r < datos.length; r++) {
    var fila = datos[r];
    if (fila.join('').trim() === '') continue;
    var modo = altaFamModo_(String(fila[cols.estado] || '').trim());
    if (!modo) continue;
    var fam = altaFamLeer_(cab, fila, String(fila[cols.id] || '').trim());
    // Una fila en espera solo se vuelve a tratar si ha cambiado algún dato suyo
    // (así no se repiten ni el resumen ni el WhatsApp cada 10 minutos).
    var claveHuella = 'altaFam|' + fam.envio;
    if (modo === 'espera' && props.getProperty(claveHuella) === fam.huella) continue;
    try {
      var linea = altaFamProcesar_(fam, modo, props);
      props.setProperty(claveHuella, fam.huellaDatos + '|' + (linea.alumnoId || fam.idAlumno));
      props.deleteProperty('altaFamErr|' + fam.envio);
      hoja.getRange(r + 1, cols.estado + 1).setValue(linea.estado);
      if (linea.cuentas) hoja.getRange(r + 1, cols.cuentas + 1).setValue(linea.cuentas);
      if (linea.alumnoId) hoja.getRange(r + 1, cols.id + 1).setValue(linea.alumnoId);
      if (linea.html) resumen.push(linea);
    } catch (e) {
      // Fallos pasajeros del campus: se reintenta en la siguiente pasada.
      var n = Number(props.getProperty('altaFamErr|' + fam.envio) || 0) + 1;
      props.setProperty('altaFamErr|' + fam.envio, String(n));
      console.error('Alta de la familia de ' + (fam.alumno || 'fila ' + (r + 1)) + ': ' + e.message);
      if (n >= ALTA_FAM.INTENTOS || e.definitivo) {
        props.deleteProperty('altaFamErr|' + fam.envio);
        props.setProperty(claveHuella, fam.huella);
        hoja.getRange(r + 1, cols.estado + 1).setValue('ERROR · ' + e.message);
        resumen.push({ html: altaFamCaja_(fam.alumno || 'Fila ' + (r + 1), 'Error', '<p style="margin:0">No se ha podido dar de alta: ' +
          kiruEscapar(e.message) + '. Cuando lo arregles, vacía su casilla CAMPUS ALTA y se volverá a intentar.</p>'),
          texto: (fam.alumno || 'Fila ' + (r + 1)) + ': ERROR ' + e.message });
      }
    }
  }
  if (resumen.length) altaFamEnviarResumen_(resumen);
}

// ===== Registro de envíos (uno por familia, una entrada por persona) =====

function altaFamLog_(props, envio) {
  try { return JSON.parse(props.getProperty('altaFamEnv|' + envio) || '') || { t: {}, a: '' }; } catch (e) { return { t: {}, a: '' }; }
}
function altaFamGuardarLog_(props, envio, log) {
  props.setProperty('altaFamEnv|' + envio, JSON.stringify(log));
}

function altaFamAhora_() {
  return Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm');
}

/** Da de alta una familia y manda sus correos. Devuelve lo que se escribe en la hoja y el resumen. */
function altaFamProcesar_(fam, modo, props) {
  var nombre = fam.alumno || 'Familia sin nombre de alumno';
  if (!fam.autoriza) {
    return {
      estado: 'SIN AUTORIZACIÓN · no se ha creado nada',
      html: altaFamCaja_(nombre, 'Sin autorización', '<p style="margin:0">La familia no marcó «Autorización para crear una cuenta en la Plataforma Kiru», así que no se ha creado ninguna cuenta. ' +
        'Si lo autorizan después (por ejemplo, rellenando de nuevo el formulario), vacía su casilla CAMPUS ALTA y se dará de alta.</p>'),
      texto: nombre + ': sin autorización, no se crea nada.',
    };
  }

  // Datos obligatorios: nombre del alumno y al menos un tutor con nombre y correo válido.
  var faltan = [];
  if (!fam.alumno) faltan.push('el nombre del alumno');
  fam.tutores.forEach(function (t) { if (t.correoMal) faltan.push('un correo válido para ' + t.nombre + ' (pone «' + t.correoMal + '»)'); });
  var conCorreo = fam.tutores.filter(function (t) { return t.correo; });
  var sinCorreo = fam.tutores.filter(function (t) { return !t.correo; });
  if (!conCorreo.length && !fam.tutores.some(function (t) { return t.correoMal; })) faltan.push('el correo de algún tutor');
  if (!fam.alumno || !conCorreo.length) {
    return {
      estado: 'PENDIENTE · falta ' + faltan.join(', '),
      html: altaFamCaja_(nombre, 'Pendiente', '<p style="margin:0 0 8px">No se ha creado ninguna cuenta todavía. Falta ' + kiruEscapar(faltan.join(', ')) +
        '. En cuanto lo corrijas en la hoja, la siguiente pasada la dará de alta.</p>' + altaFamWhatsappHtml_(fam, sinCorreo)),
      texto: nombre + ': PENDIENTE, falta ' + faltan.join(', ') + '.',
    };
  }

  // 1. Primera llamada: crea lo que falte. Nunca genera enlaces para cuentas que ya existían.
  var res = altaFamLlamarCampus_(fam, conCorreo, [], false);
  if (res.review) {
    var cand = (res.candidates || []).map(function (c) { return c.fullName + ' (@' + c.username + ', id ' + c.id + ')'; }).join('; ');
    return {
      estado: 'REVISIÓN MANUAL · ya hay un alumno con ese nombre: ' + cand + '. Escribe en CAMPUS ID ALUMNO su id si es el mismo, o NUEVO si es otro.',
      html: altaFamCaja_(nombre, 'Revisión manual', '<p style="margin:0 0 8px">' + kiruEscapar(res.reason) + ' No se ha creado ninguna cuenta.</p><ul style="margin:0 0 8px;padding-left:18px">' +
        (res.candidates || []).map(function (c) {
          return '<li>' + kiruEscapar(c.fullName) + ' — @' + kiruEscapar(c.username) + ' — id <code>' + kiruEscapar(c.id) + '</code></li>';
        }).join('') + '</ul><p style="margin:0">Si es el mismo niño, copia su id en la casilla CAMPUS ID ALUMNO de esta familia. Si es otro, escribe NUEVO. ' +
        'En 10 minutos se completará el alta.</p>'),
      texto: nombre + ': REVISIÓN MANUAL, ya hay un alumno con ese nombre (' + cand + ').',
    };
  }

  // 2. ¿A quién le falta todavía su correo? Cada persona por separado, según el registro.
  var log = altaFamLog_(props, fam.envio);
  var manual = modo === 'reenviar';
  var porCorreo = {};
  res.guardians.forEach(function (g) { porCorreo[g.email] = g; });
  var pedirEnlace = [];
  res.guardians.forEach(function (g) {
    if (g.status === 'error') return;
    if (manual) { if (!g.hasSignedIn && !g.accessUrl) pedirEnlace.push(g.email); return; }
    if (log.t[g.email]) return;                 // ya recibió su correo: no se toca
    if (g.status === 'already' && !g.hasSignedIn) pedirEnlace.push(g.email); // su enlace se perdió (Gmail falló)
  });
  var s = res.student;
  var pedirAlumno = !s.accessUrl && !s.hasSignedIn && (manual || !log.a);
  if (pedirEnlace.length || pedirAlumno) {
    var res2 = altaFamLlamarCampus_(fam, conCorreo, pedirEnlace, pedirAlumno);
    if (res2.review) throw new Error('el campus pide revisión en el reenvío');
    res2.guardians.forEach(function (g) {
      if (g.accessUrl && porCorreo[g.email]) { porCorreo[g.email].accessUrl = g.accessUrl; porCorreo[g.email].expiresAt = g.expiresAt; porCorreo[g.email].reenviado = true; }
    });
    if (res2.student.accessUrl) { s.accessUrl = res2.student.accessUrl; s.expiresAt = res2.student.expiresAt; }
  }

  // 3. Envíos, uno a uno; cada uno que sale bien queda apuntado al momento.
  var envios = res.guardians.filter(function (g) {
    if (g.status === 'error') return false;
    if (g.accessUrl) return true;                               // cuenta nueva o enlace reenviado
    if (manual) return false;
    return !log.t[g.email] && (g.status === 'linked' || g.hasSignedIn); // aviso a quien ya tenía acceso
  });
  var alumnoPila = fam.alumno.split(/\s+/)[0];
  var accesoAlumno = s.accessUrl ? s : null;
  if (accesoAlumno && !envios.length) {
    // Solo falta el acceso del alumno: va al primer tutor que pueda recibirlo.
    var destino = res.guardians.filter(function (g) { return g.status !== 'error'; })[0];
    if (destino) envios.push({ email: destino.email, fullName: destino.fullName, username: destino.username, soloAlumno: true });
  }
  var fallos = [];
  envios.forEach(function (g) {
    var tutor = conCorreo.filter(function (t) { return t.correo === g.email; })[0] || { nombre: g.fullName };
    var conAlumno = accesoAlumno;
    try {
      altaFamCorreoTutor_(tutor, g, alumnoPila, conAlumno, res.loginUrl);
      log.t[g.email] = altaFamAhora_();
      if (conAlumno) { log.a = altaFamAhora_() + ' a ' + g.email; accesoAlumno = null; }
      altaFamGuardarLog_(props, fam.envio, log);
      g.enviado = true;
      if (porCorreo[g.email]) porCorreo[g.email].enviado = true;
    } catch (e) {
      g.fallo = e.message;
      if (porCorreo[g.email]) porCorreo[g.email].fallo = e.message;
      fallos.push(g.email);
    }
  });
  if (accesoAlumno) fallos.push('acceso de ' + alumnoPila);

  // 4. Estado de la familia.
  var errores = res.guardians.filter(function (g) { return g.status === 'error'; });
  var pendientes = sinCorreo.map(function (t) { return t.nombre; });
  var recibidos = Object.keys(log.t);
  var claveGm = 'altaFamGm|' + fam.envio;
  var estado;
  var titulo;
  var intentos = 0;
  if (fallos.length) {
    intentos = Number(props.getProperty(claveGm) || 0) + 1;
    props.setProperty(claveGm, String(intentos));
    estado = intentos < ALTA_FAM.INTENTOS
      ? 'CUENTAS CREADAS · reintentando el correo a ' + fallos.join(', ') + ' (intento ' + intentos + ' de ' + ALTA_FAM.INTENTOS + ')'
      : 'CUENTAS CREADAS · no se ha podido enviar a ' + fallos.join(', ') + ': revisa el correo y escribe REENVIAR';
    titulo = 'Cuentas creadas, falta enviar un correo';
  } else {
    props.deleteProperty(claveGm);
    if (pendientes.length) {
      estado = 'ALTA PARCIAL · acceso enviado a ' + recibidos.join(', ') + ' · PENDIENTE correo de ' + pendientes.join(' y ');
      titulo = 'Alta parcial';
    } else if (res.guardians.some(function (g) { return g.accessUrl; }) || log.a) {
      estado = 'ACCESO ENVIADO · ' + altaFamAhora_();
      titulo = 'Acceso enviado';
    } else {
      estado = 'CUENTA ENLAZADA · aviso enviado (ya tenían acceso) · ' + altaFamAhora_();
      titulo = 'Cuenta enlazada';
    }
  }
  if (errores.length) estado += ' · REVISAR ' + errores.map(function (g) { return g.email; }).join(', ');
  var cuentas = 'alumno @' + s.username + res.guardians.filter(function (g) { return g.username; })
    .map(function (g) { return ' · @' + g.username; }).join('');
  // Se avisa a Sofía si ha pasado algo nuevo; de un fallo de Gmail, solo la primera y la última vez.
  var avisarFallo = fallos.length && (intentos === 1 || intentos >= ALTA_FAM.INTENTOS);
  var algoNuevo = envios.some(function (g) { return g.enviado; }) || errores.length || avisarFallo ||
    (pendientes.length && modo !== 'reintento');
  return {
    estado: estado,
    cuentas: cuentas,
    alumnoId: s.id,
    html: algoNuevo ? altaFamHtmlFamilia_(fam, res, sinCorreo, titulo, log) : '',
    texto: fam.alumno + ': ' + estado,
  };
}

function altaFamLlamarCampus_(fam, conCorreo, reenviarA, reenviarAlumno) {
  var clave = PropertiesService.getScriptProperties().getProperty('KIRU_ALTA_SECRET');
  if (!clave) throw new Error('Falta la propiedad KIRU_ALTA_SECRET (Configuración del proyecto → Propiedades del script).');
  var cuerpo = {
    submissionId: fam.envio,
    authorized: true,
    student: { fullName: fam.alumno },
    guardians: conCorreo.map(function (t) { return { fullName: t.nombre, email: t.correo, relationship: t.relacion }; }),
    resendTo: reenviarA,
    resendStudent: reenviarAlumno === true,
  };
  if (fam.decision && fam.decision.studentId) cuerpo.studentId = fam.decision.studentId;
  if (fam.decision && fam.decision.nuevo) cuerpo.newStudent = true;
  var r = UrlFetchApp.fetch(ALTA_FAM.URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + clave },
    payload: JSON.stringify(cuerpo),
    muteHttpExceptions: true,
  });
  var datos = {};
  try { datos = JSON.parse(r.getContentText()); } catch (e) {}
  if (r.getResponseCode() !== 200) {
    var err = new Error('el campus respondió ' + r.getResponseCode() + ': ' + (datos.error || r.getContentText().slice(0, 200)));
    err.definitivo = r.getResponseCode() >= 400 && r.getResponseCode() < 500 && r.getResponseCode() !== 429;
    throw err;
  }
  return datos;
}

// ===== Lectura de la hoja =====

function altaFamHoja_() {
  var libro = SpreadsheetApp.openById(ALTA_FAM.HOJA_ID);
  return libro.getSheetByName(ALTA_FAM.PESTANA) || libro.getSheets()[0];
}

/** Índices (desde 0) de las columnas del alta; las crea al final si no están. */
function altaFamColumnas_(hoja) {
  var cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
  var out = {};
  [['estado', ALTA_FAM.COL_ESTADO], ['cuentas', ALTA_FAM.COL_CUENTAS], ['id', ALTA_FAM.COL_ID]].forEach(function (par) {
    var i = cab.indexOf(par[1]);
    if (i < 0) {
      i = cab.length;
      hoja.getRange(1, i + 1).setValue(par[1]).setFontWeight('bold');
      cab.push(par[1]);
    }
    out[par[0]] = i;
  });
  return out;
}

function altaFamNorm_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Primera columna cuyo título empieza así. */
function altaFamVal_(cab, fila, prefijo) {
  var p = altaFamNorm_(prefijo);
  for (var i = 0; i < cab.length; i++) {
    if (altaFamNorm_(cab[i]).indexOf(p) === 0) return String(fila[i] == null ? '' : fila[i]).replace(/\s+/g, ' ').trim();
  }
  return '';
}

/** Junta todas las columnas que empiezan igual (Jotform separa nombre y apellidos). */
function altaFamTodas_(cab, fila, prefijo) {
  var p = altaFamNorm_(prefijo);
  return cab.map(function (h, i) { return altaFamNorm_(h).indexOf(p) === 0 ? String(fila[i] == null ? '' : fila[i]).trim() : ''; })
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** idAlumno: lo que hay en CAMPUS ID ALUMNO (un id, NUEVO o nada). */
function altaFamLeer_(cab, fila, idAlumno) {
  idAlumno = String(idAlumno || '').trim();
  var alumno = altaFamTodas_(cab, fila, 'Nombre y apellidos del alumno');
  var envio = altaFamVal_(cab, fila, 'Submission ID').replace(/[^A-Za-z0-9._:-]/g, '');
  if (!envio) {
    // Sin número de envío de Jotform: huella estable de la fecha de envío.
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, altaFamVal_(cab, fila, 'Submission Date'));
    envio = 'h-' + bytes.slice(0, 12).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  }
  var tutores = [];
  var avisos = [];
  [1, 2].forEach(function (n) {
    var nombre = altaFamVal_(cab, fila, 'Nombre y apellidos del progenitor/tutor ' + n);
    var correo = altaFamVal_(cab, fila, 'Correo electrónico del progenitor/tutor ' + n).toLowerCase().replace(/\s+/g, '');
    if (!nombre && !correo) return;
    var correoMal = '';
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { correoMal = correo; correo = ''; }
    var t = {
      n: n,
      nombre: nombre || ('Tutor ' + n),
      correo: correo,
      correoMal: correoMal,
      relacion: altaFamVal_(cab, fila, 'Relación con el alumno del progenitor/tutor ' + n),
      telefono: altaFamVal_(cab, fila, 'Teléfono del progenitor/tutor ' + n),
    };
    var t1 = tutores[0];
    if (t1) {
      var mismoNombre = altaFamNorm_(t.nombre) === altaFamNorm_(t1.nombre);
      // Solo se descarta el tutor 2 si es claramente el mismo: mismo nombre y sin
      // un correo distinto. Con otro nombre o con otro correo, cuenta como tutor.
      if (mismoNombre && (!t.correo || t.correo === t1.correo) && !t.correoMal) return;
      if (t.correo && t.correo === t1.correo) {
        avisos.push(t1.nombre + ' y ' + t.nombre + ' han puesto el mismo correo; solo puede haber una cuenta por correo, así que ' +
          t.nombre + ' queda pendiente de un correo propio.');
        t.correo = '';
      }
    }
    tutores.push(t);
  });
  var decision = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idAlumno)) decision = { studentId: idAlumno.toLowerCase() };
  else if (/^nuevo$/i.test(idAlumno)) decision = { nuevo: true };
  var fam = {
    envio: envio,
    alumno: alumno,
    autoriza: /^s[ií]/i.test(altaFamVal_(cab, fila, 'Autorización para crear una cuenta en la Plataforma Kiru')),
    tutores: tutores,
    avisos: avisos,
    decision: decision,
    idAlumno: idAlumno,
    // Huella de los datos de la fila; la casilla CAMPUS ID ALUMNO se añade aparte
    // porque el propio script la rellena al terminar.
    huellaDatos: [alumno, altaFamVal_(cab, fila, 'Autorización para crear una cuenta')].concat(tutores.map(function (t) {
      return t.nombre + '<' + (t.correo || t.correoMal) + '>';
    })).join('|'),
    huella: '',
  };
  fam.huella = fam.huellaDatos + '|' + idAlumno;
  return fam;
}

// ===== Correos =====

function altaFamBoton_(url, texto, color) {
  return '<a href="' + kiruEscapar(url) + '" style="display:inline-block;padding:12px 22px;border-radius:10px;background:' + (color || '#242321') +
    ';color:#FFFFFF;text-decoration:none;font-weight:bold">' + kiruEscapar(texto) + '</a>';
}

function altaFamFecha_(iso) {
  return iso ? Utilities.formatDate(new Date(iso), 'Europe/Madrid', 'dd/MM/yyyy') : '';
}

/** Correo a un tutor: su acceso (si tiene enlace) o un aviso, y si le toca, el acceso del alumno. */
function altaFamCorreoTutor_(tutor, g, alumnoPila, acceso, loginUrl) {
  var pila = /^tutor \d$/i.test(tutor.nombre || '') ? '' : String(tutor.nombre || '').split(/\s+/)[0];
  var html = '<p>Hola' + (pila ? ' ' + kiruEscapar(pila) : '') + ':</p>';
  var texto = 'Hola' + (pila ? ' ' + pila : '') + ':\n\n';
  var queEs = 'En la Plataforma Kiru podréis seguir el acompañamiento de ' + alumnoPila + ': sus sesiones y su calendario, las observaciones de su mentor, ' +
    'los informes de progreso y las recompensas que consigue con sus SkillCoins.';
  if (g.soloAlumno) {
    html += '<p>Te enviamos el acceso a la cuenta de <strong>' + kiruEscapar(alumnoPila) + '</strong>.</p>';
    texto += 'Te enviamos el acceso a la cuenta de ' + alumnoPila + '.\n\n';
  } else if (g.accessUrl) {
    html += '<p>' + kiruEscapar(queEs) + '</p>' +
      '<p>Tu usuario es <strong>' + kiruEscapar(g.username) + '</strong>. Pulsa el botón, elige un PIN de 6 números y entrarás directamente.</p>' +
      '<p style="margin:20px 0">' + altaFamBoton_(g.accessUrl, 'Crear mi PIN y entrar') + '</p>' +
      '<p style="font-size:12px;color:#64748B">El botón es personal, solo vale una vez y caduca el ' + altaFamFecha_(g.expiresAt) +
      (g.reenviado ? '. Si recibiste uno anterior, ya no vale: usa este' : '') +
      '. Después entrarás siempre en ' + kiruEscapar(loginUrl) + ' con tu usuario y tu PIN.</p>';
    texto += queEs + '\n\nTu usuario: ' + g.username + '\nCrea tu PIN (6 números) y entra: ' + g.accessUrl +
      '\nEl enlace es personal, vale una vez y caduca el ' + altaFamFecha_(g.expiresAt) + '.\n\n';
  } else {
    var entrar = g.hasSignedIn ? 'Entra como siempre con tu usuario <strong>' + kiruEscapar(g.username) + '</strong> y tu PIN.'
      : 'Tu usuario es <strong>' + kiruEscapar(g.username) + '</strong>. Si todavía no tienes PIN, en la entrada pulsa «¿Has olvidado tu PIN?» y te mandaremos un enlace para crearlo.';
    html += '<p>Hemos añadido a <strong>' + kiruEscapar(alumnoPila) + '</strong> a tu cuenta de la Plataforma Kiru. ' + entrar + '</p>' +
      '<p style="margin:20px 0">' + altaFamBoton_(loginUrl, 'Entrar en la Plataforma Kiru') + '</p>';
    texto += 'Hemos añadido a ' + alumnoPila + ' a tu cuenta de la Plataforma Kiru (' + loginUrl + '). Tu usuario: ' + g.username + '.' +
      (g.hasSignedIn ? '' : ' Si todavía no tienes PIN, pulsa «¿Has olvidado tu PIN?» en la entrada.') + '\n\n';
  }
  if (acceso) {
    html += '<div style="margin:24px 0;padding:18px;border-radius:12px;background:#F3EFE6">' +
      '<p style="margin:0 0 8px"><strong>La cuenta de ' + kiruEscapar(alumnoPila) + '</strong></p>' +
      '<p style="margin:0 0 8px">' + kiruEscapar(alumnoPila) + ' también tiene su propia cuenta para ver sus tareas y sus SkillCoins. Su usuario es <strong>' +
      kiruEscapar(acceso.username) + '</strong>. Abrid juntos este botón y elegid su PIN de 6 números:</p>' +
      '<p style="margin:12px 0 0">' + altaFamBoton_(acceso.accessUrl, 'Crear el PIN de ' + alumnoPila, '#8A775B') + '</p>' +
      '<p style="margin:12px 0 0;font-size:12px;color:#64748B">Solo vale una vez y caduca el ' + altaFamFecha_(acceso.expiresAt) + '. ' +
      'Guardad el PIN: si se olvida, escribidnos y lo cambiamos.</p></div>';
    texto += 'La cuenta de ' + alumnoPila + ': usuario ' + acceso.username + '. Abrid juntos este enlace y elegid su PIN de 6 números: ' + acceso.accessUrl +
      '\nVale una vez y caduca el ' + altaFamFecha_(acceso.expiresAt) + '.\n\n';
  }
  html += '<p>Un saludo,<br>Equipo Método Kiru</p>';
  texto += 'Un saludo,\nEquipo Método Kiru';
  var asunto = g.soloAlumno ? 'Método Kiru | Acceso de ' + alumnoPila + ' a la Plataforma Kiru'
    : g.accessUrl ? 'Método Kiru | Tu acceso a la Plataforma Kiru' : 'Método Kiru | ' + alumnoPila + ' ya está en tu cuenta';
  GmailApp.sendEmail(g.email, asunto, texto, { htmlBody: html, name: KIRU_REMITENTE });
}

/** Número para wa.me: 9 cifras españolas → 34…; con + o 00 delante se deja tal cual. */
function altaFamWhatsapp_(telefono) {
  var d = String(telefono || '').replace(/[^0-9+]/g, '');
  var internacional = d.indexOf('+') === 0 || d.indexOf('00') === 0;
  d = d.replace(/^\+|^00/, '').replace(/\D/g, '');
  if (/^[6789]\d{8}$/.test(d)) return '34' + d;
  if (internacional && /^\d{10,15}$/.test(d)) return d;
  return '';
}

function altaFamCaja_(titulo, etiqueta, cuerpo) {
  return '<div style="margin:0 0 20px;padding:16px;border:1px solid #E7E2D8;border-radius:12px">' +
    '<p style="margin:0 0 8px;font-size:16px"><strong>' + kiruEscapar(titulo) + '</strong>' +
    (etiqueta ? ' <span style="font-size:12px;padding:2px 8px;border-radius:999px;background:#F3EFE6;color:#5B4A2F">' + kiruEscapar(etiqueta) + '</span>' : '') +
    '</p>' + cuerpo + '</div>';
}

/** Botones de WhatsApp para pedir el correo a cada tutor que no lo tiene. */
function altaFamWhatsappHtml_(fam, sinCorreo) {
  var alumnoPila = (fam.alumno || 'vuestro hijo/a').split(/\s+/)[0];
  var html = fam.avisos.map(function (a) { return '<p style="margin:8px 0;color:#92400E">' + kiruEscapar(a) + '</p>'; }).join('');
  sinCorreo.forEach(function (t) {
    var pila = /^tutor \d$/i.test(t.nombre) ? '' : ' ' + String(t.nombre).split(/\s+/)[0];
    var mensaje = 'Hola' + pila + ', soy Sofía de Método Kiru. Para darte acceso a la Plataforma Kiru y que puedas seguir el progreso de ' +
      alumnoPila + ', necesito tu correo electrónico. ¿Me lo puedes mandar por aquí? ¡Gracias!';
    var numero = altaFamWhatsapp_(t.telefono);
    var url = 'https://wa.me/' + numero + '?text=' + encodeURIComponent(mensaje);
    html += '<p style="margin:14px 0 6px">Falta el correo de <strong>' + kiruEscapar(t.nombre) + '</strong>' +
      (numero ? '' : ' (no hay un teléfono válido en la hoja: WhatsApp te dejará elegir el contacto)') + '.</p>' +
      '<p style="margin:0 0 6px">' + altaFamBoton_(url, 'Pedírselo por WhatsApp', '#1F8F4E') + '</p>' +
      '<p style="margin:0;font-size:12px;color:#64748B">Cuando te lo dé, escríbelo en su casilla «Correo electrónico del progenitor/tutor ' + t.n +
      '» de la hoja y en 10 minutos tendrá su cuenta y su correo de acceso.</p>';
  });
  return html;
}

function altaFamHtmlFamilia_(fam, res, sinCorreo, titulo, log) {
  var s = res.student;
  var html = '<ul style="margin:0;padding-left:18px">';
  var alumnoTxt = (s.status === 'created' ? 'cuenta creada' : 'ya existía') +
    (log.a ? ' · su acceso se envió ' + kiruEscapar(log.a) : s.hasSignedIn ? ' · ya ha entrado' : ' · <strong style="color:#B91C1C">su acceso aún no ha salido</strong>');
  html += '<li>Alumno @' + kiruEscapar(s.username) + ' — ' + alumnoTxt + '. ID para Contabilidad: <code>' + kiruEscapar(s.id) + '</code></li>';
  res.guardians.forEach(function (g) {
    var cuenta = { created: 'cuenta creada', linked: 'ya tenía cuenta de familia; se le ha enlazado el alumno', already: 'cuenta ya enlazada', resent: 'cuenta ya enlazada' }[g.status];
    var txt = g.status === 'error'
      ? '<strong style="color:#B91C1C">' + kiruEscapar(g.error) + '</strong> Corrige el correo en la hoja y vacía su casilla CAMPUS ALTA.'
      : cuenta + ' · ' + (g.fallo ? '<strong style="color:#B91C1C">el correo no ha salido (' + kiruEscapar(g.fallo) + '); se reintentará solo</strong>'
        : log.t[g.email] ? (g.accessUrl ? 'acceso enviado ' : 'aviso enviado ') + kiruEscapar(log.t[g.email]) : g.hasSignedIn ? 'ya ha entrado' : 'sin correo enviado');
    html += '<li>' + kiruEscapar(g.fullName) + ' (' + kiruEscapar(g.email) + ')' + (g.username ? ' @' + kiruEscapar(g.username) : '') + ' — ' + txt + '</li>';
  });
  sinCorreo.forEach(function (t) {
    html += '<li>' + kiruEscapar(t.nombre) + ' — <strong>pendiente</strong>: sin correo, todavía no tiene cuenta.</li>';
  });
  html += '</ul><p style="margin:10px 0 0;font-size:12px;color:#64748B">El alumno aún no está activo: el alta no asigna mentor, horario, clases ni pagos. ' +
    'Se activa como siempre, con «Activa» en la pestaña Familias de Contabilidad y asignándole mentor.</p>';
  return altaFamCaja_(fam.alumno, titulo, html + altaFamWhatsappHtml_(fam, sinCorreo));
}

function altaFamEnviarResumen_(lineas) {
  var hoja = 'https://docs.google.com/spreadsheets/d/' + ALTA_FAM.HOJA_ID + '/edit';
  var html = '<p>Hola Sofía:</p><p>Esto es lo que se ha hecho en el Campus con las respuestas del formulario de familias:</p>' +
    lineas.map(function (l) { return l.html; }).join('') +
    '<p style="font-size:12px;color:#64748B">Lo tienes también en las columnas CAMPUS ALTA y CAMPUS CUENTAS de <a href="' + hoja + '">Familias Kiru (respuestas)</a>.</p>';
  var texto = 'Altas en el Campus:\n\n' + lineas.map(function (l) { return '- ' + l.texto; }).join('\n') + '\n\nHoja: ' + hoja;
  GmailApp.sendEmail(ALTA_FAM.AVISO, 'Método Kiru | Altas de familias en el Campus', texto, { htmlBody: html, name: KIRU_REMITENTE });
}
