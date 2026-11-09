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
 *     tutor. Un tutor que ya tenía cuenta recibe solo un aviso, sin acceso nuevo.
 *  4. Manda a metodokiru@gmail.com un resumen. Si falta un dato, la fila queda
 *     PENDIENTE y el resumen lo dice; si falta el correo de un tutor, lleva un
 *     botón de WhatsApp con el mensaje ya escrito para pedírselo.
 *
 * Columnas que añade a la hoja:
 *  - CAMPUS ALTA: PENDIENTE · … / SIN AUTORIZACIÓN / CUENTAS CREADAS · acceso
 *    sin enviar / ACCESO ENVIADO (con «· PENDIENTE correo de …» si falta un
 *    tutor) / ERROR · … / Anterior al alta automática.
 *  - CAMPUS CUENTAS: usuarios creados o enlazados.
 *  - CAMPUS ID ALUMNO: el id que pide la pestaña Familias de Contabilidad.
 * El alta NO activa el servicio: no asigna mentor, horario, clases ni pagos.
 * El alumno pasa a activo cuando se marca «Activa» en Contabilidad y se le
 * asignan mentor y horario, como hasta ahora.
 *
 * Lo que puede hacer Sofía en CAMPUS ALTA:
 *  - Corregir un dato de la fila (por ejemplo, el correo que faltaba): la
 *    siguiente pasada lo detecta sola.
 *  - Escribir REENVIAR: se manda de nuevo el acceso a quien aún no ha entrado
 *    nunca (el enlace anterior deja de valer).
 *  - Escribir OK: se da por cerrada aunque falte el correo de un tutor.
 *  - Vaciarla: se vuelve a procesar desde cero (nunca duplica cuentas).
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

/** Estados que se vuelven a mirar en cada pasada. */
function altaFamPendiente_(estado) {
  return estado === '' || /^PENDIENTE/i.test(estado) || /PENDIENTE correo/i.test(estado) || /^REENVIAR$/i.test(estado);
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
    var estado = String(fila[cols.estado] || '').trim();
    if (!altaFamPendiente_(estado)) continue;
    var fam = altaFamLeer_(cab, fila);
    var reenviar = /^REENVIAR$/i.test(estado);
    // Una fila pendiente solo se vuelve a tratar si ha cambiado algún dato suyo
    // (así no se repiten ni el resumen ni el WhatsApp cada 10 minutos).
    var claveHuella = 'altaFam|' + fam.envio;
    if (estado !== '' && !reenviar && props.getProperty(claveHuella) === fam.huella) continue;
    try {
      var linea = altaFamProcesar_(fam, reenviar);
      props.setProperty(claveHuella, fam.huella);
      props.deleteProperty('altaFamErr|' + fam.envio);
      hoja.getRange(r + 1, cols.estado + 1).setValue(linea.estado);
      if (linea.cuentas) hoja.getRange(r + 1, cols.cuentas + 1).setValue(linea.cuentas);
      if (linea.alumnoId) hoja.getRange(r + 1, cols.id + 1).setValue(linea.alumnoId);
      if (linea.html) resumen.push(linea);
    } catch (e) {
      // Fallos pasajeros (campus caído): se reintenta en la siguiente pasada.
      var n = Number(props.getProperty('altaFamErr|' + fam.envio) || 0) + 1;
      props.setProperty('altaFamErr|' + fam.envio, String(n));
      console.error('Alta de la familia de ' + (fam.alumno || 'fila ' + (r + 1)) + ': ' + e.message);
      if (n >= ALTA_FAM.INTENTOS || e.definitivo) {
        props.deleteProperty('altaFamErr|' + fam.envio);
        props.setProperty(claveHuella, fam.huella);
        hoja.getRange(r + 1, cols.estado + 1).setValue('ERROR · ' + e.message);
        resumen.push({ html: altaFamCaja_(fam.alumno || 'Fila ' + (r + 1), '<p style="margin:0">No se ha podido dar de alta: ' + kiruEscapar(e.message) +
          '. Cuando lo arregles, vacía su casilla CAMPUS ALTA y se volverá a intentar.</p>'),
          texto: (fam.alumno || 'Fila ' + (r + 1)) + ': ERROR ' + e.message });
      }
    }
  }
  if (resumen.length) altaFamEnviarResumen_(resumen);
}

/** Da de alta una familia y manda sus correos. Devuelve lo que se escribe en la hoja y el resumen. */
function altaFamProcesar_(fam, reenviar) {
  var nombre = fam.alumno || 'Familia sin nombre de alumno';
  if (!fam.autoriza) {
    return {
      estado: 'SIN AUTORIZACIÓN · no se ha creado nada',
      html: altaFamCaja_(nombre, '<p style="margin:0">La familia no marcó «Autorización para crear una cuenta en la Plataforma Kiru», así que no se ha creado ninguna cuenta. ' +
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
      html: altaFamCaja_(nombre, '<p style="margin:0 0 8px">No se ha creado ninguna cuenta todavía. Falta ' + kiruEscapar(faltan.join(', ')) +
        '. En cuanto lo corrijas en la hoja, la siguiente pasada la dará de alta.</p>' + altaFamWhatsappHtml_(fam, sinCorreo)),
      texto: nombre + ': PENDIENTE, falta ' + faltan.join(', ') + '.',
    };
  }

  var res = altaFamLlamarCampus_(fam, conCorreo, reenviar);
  var alumnoPila = fam.alumno.split(/\s+/)[0];
  var accesoAlumno = res.student.accessUrl ? res.student : null; // solo al crearlo o al reenviar
  var sinEnviar = [];
  res.guardians.forEach(function (g) {
    var tutor = conCorreo.filter(function (t) { return t.correo === g.email; })[0] || { nombre: g.fullName };
    var toca = g.status === 'created' || g.status === 'resent' || g.status === 'linked' || (accesoAlumno && g.status === 'already');
    if (!toca) return;
    try {
      altaFamCorreoTutor_(tutor, g, alumnoPila, accesoAlumno, res.loginUrl);
      g.enviado = true;
      if (accesoAlumno) { g.conAlumno = true; accesoAlumno = null; }
    } catch (e) {
      g.fallo = e.message;
      sinEnviar.push(g.email);
    }
  });
  if (accesoAlumno) sinEnviar.push('acceso de ' + alumnoPila);

  var errores = res.guardians.filter(function (g) { return g.status === 'error'; });
  var pendientes = sinCorreo.map(function (t) { return t.nombre; });
  // Con un correo sin salir, la fila queda PENDIENTE para que Sofía escriba REENVIAR.
  var accesoEnviado = res.guardians.some(function (g) { return g.enviado && (g.accessUrl || g.conAlumno); });
  var estado = sinEnviar.length ? 'CUENTAS CREADAS · acceso sin enviar (' + sinEnviar.join(', ') + '): escribe REENVIAR'
    : accesoEnviado ? 'ACCESO ENVIADO'
    : res.guardians.some(function (g) { return g.enviado; }) ? 'CUENTA ENLAZADA · aviso enviado (ya tenían acceso)'
    : 'CUENTAS AL DÍA';
  estado += ' · ' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm');
  if (pendientes.length) estado += ' · PENDIENTE correo de ' + pendientes.join(' y ');
  if (errores.length) estado += ' · REVISAR ' + errores.map(function (g) { return g.email; }).join(', ');
  var cuentas = 'alumno @' + res.student.username + res.guardians.filter(function (g) { return g.username; })
    .map(function (g) { return ' · @' + g.username; }).join('');
  var algoNuevo = res.student.status === 'created' || res.student.status === 'resent' || pendientes.length || errores.length || sinEnviar.length ||
    res.guardians.some(function (g) { return g.enviado; });
  return {
    estado: estado,
    cuentas: cuentas,
    alumnoId: res.student.id,
    html: algoNuevo ? altaFamHtmlFamilia_(fam, res, sinCorreo) : '',
    texto: fam.alumno + ': ' + estado,
  };
}

function altaFamLlamarCampus_(fam, conCorreo, reenviar) {
  var clave = PropertiesService.getScriptProperties().getProperty('KIRU_ALTA_SECRET');
  if (!clave) throw new Error('Falta la propiedad KIRU_ALTA_SECRET (Configuración del proyecto → Propiedades del script).');
  var r = UrlFetchApp.fetch(ALTA_FAM.URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + clave },
    payload: JSON.stringify({
      submissionId: fam.envio,
      authorized: true,
      resend: reenviar === true,
      student: { fullName: fam.alumno },
      guardians: conCorreo.map(function (t) { return { fullName: t.nombre, email: t.correo, relationship: t.relacion }; }),
    }),
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

function altaFamLeer_(cab, fila) {
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
  return {
    envio: envio,
    alumno: alumno,
    autoriza: /^s[ií]/i.test(altaFamVal_(cab, fila, 'Autorización para crear una cuenta en la Plataforma Kiru')),
    tutores: tutores,
    avisos: avisos,
    huella: [alumno, altaFamVal_(cab, fila, 'Autorización para crear una cuenta')].concat(tutores.map(function (t) {
      return t.nombre + '<' + (t.correo || t.correoMal) + '>';
    })).join('|'),
  };
}

// ===== Correos =====

function altaFamBoton_(url, texto, color) {
  return '<a href="' + kiruEscapar(url) + '" style="display:inline-block;padding:12px 22px;border-radius:10px;background:' + (color || '#242321') +
    ';color:#FFFFFF;text-decoration:none;font-weight:bold">' + kiruEscapar(texto) + '</a>';
}

function altaFamFecha_(iso) {
  return iso ? Utilities.formatDate(new Date(iso), 'Europe/Madrid', 'dd/MM/yyyy') : '';
}

/** Correo a un tutor: su acceso (si es nuevo) o un aviso, y si le toca, el acceso del alumno. */
function altaFamCorreoTutor_(tutor, g, alumnoPila, acceso, loginUrl) {
  var pila = /^tutor \d$/i.test(tutor.nombre || '') ? '' : String(tutor.nombre || '').split(/\s+/)[0];
  var html = '<p>Hola' + (pila ? ' ' + kiruEscapar(pila) : '') + ':</p>';
  var texto = 'Hola' + (pila ? ' ' + pila : '') + ':\n\n';
  var queEs = 'En la Plataforma Kiru podréis seguir el acompañamiento de ' + alumnoPila + ': sus sesiones y su calendario, las observaciones de su mentor, ' +
    'los informes de progreso y las recompensas que consigue con sus SkillCoins.';
  if (g.accessUrl) {
    html += '<p>' + kiruEscapar(queEs) + '</p>' +
      '<p>Tu usuario es <strong>' + kiruEscapar(g.username) + '</strong>. Pulsa el botón, elige un PIN de 6 números y entrarás directamente.</p>' +
      '<p style="margin:20px 0">' + altaFamBoton_(g.accessUrl, 'Crear mi PIN y entrar') + '</p>' +
      '<p style="font-size:12px;color:#64748B">El botón es personal, solo vale una vez y caduca el ' + altaFamFecha_(g.expiresAt) +
      '. Después entrarás siempre en ' + kiruEscapar(loginUrl) + ' con tu usuario y tu PIN.</p>';
    texto += queEs + '\n\nTu usuario: ' + g.username + '\nCrea tu PIN (6 números) y entra: ' + g.accessUrl +
      '\nEl enlace es personal, vale una vez y caduca el ' + altaFamFecha_(g.expiresAt) + '.\n\n';
  } else if (g.status === 'already') {
    html += '<p>Te reenviamos el acceso a la cuenta de <strong>' + kiruEscapar(alumnoPila) + '</strong>.</p>';
    texto += 'Te reenviamos el acceso a la cuenta de ' + alumnoPila + '.\n\n';
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
  var asunto = g.accessUrl ? 'Método Kiru | Tu acceso a la Plataforma Kiru' : 'Método Kiru | ' + alumnoPila + ' ya está en tu cuenta';
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

function altaFamCaja_(titulo, cuerpo) {
  return '<div style="margin:0 0 20px;padding:16px;border:1px solid #E7E2D8;border-radius:12px">' +
    '<p style="margin:0 0 8px;font-size:16px"><strong>' + kiruEscapar(titulo) + '</strong></p>' + cuerpo + '</div>';
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

function altaFamHtmlFamilia_(fam, res, sinCorreo) {
  var etiquetas = {
    created: 'cuenta creada · acceso enviado',
    linked: 'ya tenía cuenta de familia · se le ha añadido el alumno y se le ha avisado (sin acceso nuevo)',
    resent: 'acceso reenviado (el anterior ya no vale)',
    already: 'ya estaba hecho',
  };
  var s = res.student;
  var dondeAlumno = res.guardians.filter(function (g) { return g.conAlumno; })[0];
  var html = '<ul style="margin:0;padding-left:18px">';
  var alumnoTxt = s.status === 'created' || s.status === 'resent'
    ? (s.status === 'created' ? 'cuenta creada' : 'acceso reenviado') + (dondeAlumno ? ' · su acceso ha ido a ' + kiruEscapar(dondeAlumno.email)
      : ' · <strong style="color:#B91C1C">su acceso no se ha podido enviar; escribe REENVIAR en su casilla CAMPUS ALTA</strong>')
    : 'ya existía';
  html += '<li>Alumno @' + kiruEscapar(s.username) + ' — ' + alumnoTxt + '. ID para Contabilidad: <code>' + kiruEscapar(s.id) + '</code></li>';
  res.guardians.forEach(function (g) {
    var txt = g.status === 'error' ? '<strong style="color:#B91C1C">' + kiruEscapar(g.error) + '</strong> Corrige el correo en la hoja y vacía su casilla CAMPUS ALTA.'
      : g.fallo ? '<strong style="color:#B91C1C">cuenta lista, pero el correo no ha salido (' + kiruEscapar(g.fallo) + '); escribe REENVIAR en su casilla CAMPUS ALTA</strong>'
      : etiquetas[g.status];
    html += '<li>' + kiruEscapar(g.fullName) + ' (' + kiruEscapar(g.email) + ')' + (g.username ? ' @' + kiruEscapar(g.username) : '') + ' — ' + txt + '</li>';
  });
  html += '</ul><p style="margin:10px 0 0;font-size:12px;color:#64748B">El alumno aún no está activo: el alta no asigna mentor, horario, clases ni pagos. ' +
    'Se activa como siempre, con «Activa» en la pestaña Familias de Contabilidad y asignándole mentor.</p>';
  return altaFamCaja_(fam.alumno, html + altaFamWhatsappHtml_(fam, sinCorreo));
}

function altaFamEnviarResumen_(lineas) {
  var hoja = 'https://docs.google.com/spreadsheets/d/' + ALTA_FAM.HOJA_ID + '/edit';
  var html = '<p>Hola Sofía:</p><p>Esto es lo que se ha hecho en el Campus con las respuestas del formulario de familias:</p>' +
    lineas.map(function (l) { return l.html; }).join('') +
    '<p style="font-size:12px;color:#64748B">Lo tienes también en las columnas CAMPUS ALTA y CAMPUS CUENTAS de <a href="' + hoja + '">Familias Kiru (respuestas)</a>.</p>';
  var texto = 'Altas en el Campus:\n\n' + lineas.map(function (l) { return '- ' + l.texto; }).join('\n') + '\n\nHoja: ' + hoja;
  GmailApp.sendEmail(ALTA_FAM.AVISO, 'Método Kiru | Altas de familias en el Campus', texto, { htmlBody: html, name: KIRU_REMITENTE });
}
