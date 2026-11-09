/**
 * Método Kiru · Alta automática de familias en el Campus.
 *
 * Va en el proyecto de Apps Script «Kiru filtro candidatos», junto a
 * AccesoCampus (usa su KIRU_ALTA_SECRET, kiruEscapar y KIRU_REMITENTE):
 * Extensiones → Apps Script → «+» → Script → llámalo «AltaFamilias» y pega
 * este archivo entero. No cambia nada de lo que ya hace el script.
 *
 * Qué hace, cada 10 minutos:
 *  1. Mira la pestaña FAMILIAS de «Familias Kiru (respuestas)» (la rellena
 *     Jotform) y coge las respuestas con la columna CAMPUS ALTA vacía.
 *  2. Si la familia autorizó crear la cuenta en la Plataforma Kiru, pide al
 *     campus la cuenta del alumno y una de familia por cada tutor con correo,
 *     ya enlazadas con el alumno. El campus nunca duplica: se puede repetir.
 *  3. Manda a cada tutor su usuario y el botón «Crear mi PIN y entrar». El
 *     acceso del alumno (que no tiene correo) va en el correo del primer tutor.
 *  4. Manda a metodokiru@gmail.com un resumen con lo creado y, si falta el
 *     correo de algún tutor, un botón de WhatsApp con el mensaje ya escrito.
 *  5. Cuando escribes en la hoja el correo que faltaba, en la siguiente pasada
 *     se crea esa cuenta, se enlaza y se le manda su acceso.
 *
 * Para dar por cerrada una fila a la que le falta un correo que no va a
 * llegar, escribe OK en su casilla CAMPUS ALTA.
 *
 * Instalar: ejecuta una vez «altaFamiliasInstalar» y acepta los permisos.
 * Marca las respuestas que ya están en la hoja como anteriores (no las toca)
 * y crea el activador de cada 10 minutos.
 */

var ALTA_FAM = {
  URL: 'https://campus.metodokiru.es/api/familias/alta',
  HOJA_ID: '1GvHUSsM3uVsEDB6m5vrG3dMVgDnRp3P1Bzr_jPLRtsU', // «Familias Kiru (respuestas)»
  PESTANA: 'FAMILIAS',
  COL_ESTADO: 'CAMPUS ALTA',
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

function altaFamiliasRevisar_() {
  var hoja = altaFamHoja_();
  var cols = altaFamColumnas_(hoja);
  if (hoja.getLastRow() < 2) return;
  var datos = hoja.getDataRange().getValues();
  var cab = datos[0].map(String);
  var resumen = [];
  for (var r = 1; r < datos.length; r++) {
    var fila = datos[r];
    if (fila.join('').trim() === '') continue;
    var estado = String(fila[cols.estado] || '').trim();
    var pendiente = estado === '' || /^FALTA CORREO/i.test(estado);
    if (!pendiente) continue;
    var fam = altaFamLeer_(cab, fila);
    if (!fam.alumno) continue;
    // Una fila con correos pendientes solo se vuelve a mandar si ha aparecido alguno nuevo.
    var huella = fam.tutores.map(function (t) { return t.correo; }).join('|');
    var props = PropertiesService.getScriptProperties();
    var claveHuella = 'altaFam|' + fam.envio;
    if (estado !== '' && props.getProperty(claveHuella) === huella) continue;
    try {
      var linea = altaFamProcesar_(fam);
      props.setProperty(claveHuella, huella);
      props.deleteProperty('altaFamErr|' + fam.envio);
      hoja.getRange(r + 1, cols.estado + 1).setValue(linea.estado);
      if (linea.alumnoId) hoja.getRange(r + 1, cols.id + 1).setValue(linea.alumnoId);
      if (linea.html) resumen.push(linea);
    } catch (e) {
      // Fallos pasajeros (campus caído): se reintenta en la siguiente pasada.
      var n = Number(props.getProperty('altaFamErr|' + fam.envio) || 0) + 1;
      props.setProperty('altaFamErr|' + fam.envio, String(n));
      console.error('Alta de la familia de ' + fam.alumno + ': ' + e.message);
      if (n >= ALTA_FAM.INTENTOS || e.definitivo) {
        hoja.getRange(r + 1, cols.estado + 1).setValue('ERROR: ' + e.message);
        resumen.push({ html: '<p><strong>' + kiruEscapar(fam.alumno) + '</strong>: no se ha podido dar de alta. ' +
          kiruEscapar(e.message) + '. Cuando lo arregles, vacía su casilla CAMPUS ALTA y se volverá a intentar.</p>',
          texto: fam.alumno + ': ERROR ' + e.message });
      }
    }
  }
  if (resumen.length) altaFamEnviarResumen_(resumen);
}

/** Da de alta una familia y manda sus correos. Devuelve la línea para la hoja y el resumen. */
function altaFamProcesar_(fam) {
  var alumnoPila = fam.alumno.split(/\s+/)[0];
  if (!fam.autoriza) {
    return {
      estado: 'SIN AUTORIZACIÓN · no se ha creado nada',
      html: '<p><strong>' + kiruEscapar(fam.alumno) + '</strong>: la familia no marcó «Autorización para crear una cuenta en la Plataforma Kiru», así que no se ha creado ninguna cuenta. ' +
        'Si te lo autorizan después, vacía su casilla CAMPUS ALTA y la siguiente pasada la dará de alta.</p>',
      texto: fam.alumno + ': sin autorización, no se crea nada.',
    };
  }
  var conCorreo = fam.tutores.filter(function (t) { return t.correo; });
  var sinCorreo = fam.tutores.filter(function (t) { return !t.correo; });
  if (!conCorreo.length) {
    return {
      estado: 'FALTA CORREO de ' + sinCorreo.map(function (t) { return t.nombre; }).join(' y '),
      html: altaFamHtmlFamilia_(fam, null, sinCorreo),
      texto: fam.alumno + ': ningún tutor ha dado correo; no se ha creado nada todavía.',
    };
  }

  var res = altaFamLlamarCampus_(fam, conCorreo);
  var acceso = res.student.accessUrl ? res.student : null; // acceso del alumno, solo la primera vez
  res.guardians.forEach(function (g) {
    var tutor = conCorreo.filter(function (t) { return t.correo === g.email; })[0] || { nombre: g.fullName };
    if (g.status === 'created' || g.status === 'link' || g.status === 'active') {
      altaFamCorreoTutor_(tutor, g, alumnoPila, acceso, res.loginUrl);
      g.enviado = true;
      if (acceso) { g.conAlumno = true; acceso = null; }
    }
  });
  var errores = res.guardians.filter(function (g) { return g.status === 'error'; });
  var faltan = sinCorreo.map(function (t) { return t.nombre; });
  var estado = (faltan.length ? 'FALTA CORREO de ' + faltan.join(' y ') + ' · ' : 'OK ') +
    Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm') +
    ' · alumno @' + res.student.username +
    res.guardians.filter(function (g) { return g.username; }).map(function (g) { return ' · @' + g.username; }).join('') +
    (errores.length ? ' · REVISAR: ' + errores.map(function (g) { return g.email + ' (' + g.error + ')'; }).join('; ') : '');
  var algoNuevo = res.student.status === 'created' || sinCorreo.length || errores.length ||
    res.guardians.some(function (g) { return g.enviado; });
  return {
    estado: estado,
    alumnoId: res.student.id,
    html: algoNuevo ? altaFamHtmlFamilia_(fam, res, sinCorreo) : '',
    texto: fam.alumno + ': ' + estado,
  };
}

function altaFamLlamarCampus_(fam, conCorreo) {
  var clave = PropertiesService.getScriptProperties().getProperty('KIRU_ALTA_SECRET');
  if (!clave) throw new Error('Falta la propiedad KIRU_ALTA_SECRET (Configuración del proyecto → Propiedades del script).');
  var r = UrlFetchApp.fetch(ALTA_FAM.URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + clave },
    payload: JSON.stringify({
      submissionId: fam.envio,
      authorized: true,
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

/** Índices (desde 0) de las columnas CAMPUS ALTA y CAMPUS ID ALUMNO; las crea al final si no están. */
function altaFamColumnas_(hoja) {
  var cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
  var out = {};
  [['estado', ALTA_FAM.COL_ESTADO], ['id', ALTA_FAM.COL_ID]].forEach(function (par) {
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
    // Sin número de envío de Jotform: huella estable de la fecha de envío y el alumno.
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      altaFamVal_(cab, fila, 'Submission Date') + '|' + altaFamNorm_(alumno));
    envio = 'h-' + bytes.slice(0, 12).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  }
  var tutores = [];
  [1, 2].forEach(function (n) {
    var nombre = altaFamVal_(cab, fila, 'Nombre y apellidos del progenitor/tutor ' + n);
    var correo = altaFamVal_(cab, fila, 'Correo electrónico del progenitor/tutor ' + n).toLowerCase();
    if (!nombre && !correo) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) correo = '';
    var t = {
      n: n,
      nombre: nombre || ('Tutor ' + n),
      correo: correo,
      relacion: altaFamVal_(cab, fila, 'Relación con el alumno del progenitor/tutor ' + n),
      telefono: altaFamVal_(cab, fila, 'Teléfono del progenitor/tutor ' + n),
    };
    // El tutor 2 repetido (mismo nombre o mismo correo que el 1) no cuenta.
    var t1 = tutores[0];
    if (t1 && ((altaFamNorm_(t.nombre) === altaFamNorm_(t1.nombre) && (!t.correo || t.correo === t1.correo)) || (t.correo && t.correo === t1.correo))) return;
    tutores.push(t);
  });
  return {
    envio: envio,
    alumno: alumno,
    autoriza: /^s[ií]/i.test(altaFamVal_(cab, fila, 'Autorización para crear una cuenta en la Plataforma Kiru')),
    tutores: tutores,
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

/** Correo a un tutor: su acceso (si lo necesita) y, si le toca, el del alumno. */
function altaFamCorreoTutor_(tutor, g, alumnoPila, acceso, loginUrl) {
  var pila = String(tutor.nombre || '').split(/\s+/)[0];
  var html = '<p>Hola' + (pila ? ' ' + kiruEscapar(pila) : '') + ':</p>';
  var texto = 'Hola' + (pila ? ' ' + pila : '') + ':\n\n';
  if (g.accessUrl) {
    html += '<p>Ya tenéis cuenta en la Plataforma Kiru, donde podréis seguir las sesiones y el progreso de <strong>' + kiruEscapar(alumnoPila) + '</strong>.</p>' +
      '<p>Tu usuario es <strong>' + kiruEscapar(g.username) + '</strong>. Pulsa el botón, elige un PIN de 6 números y entrarás directamente.</p>' +
      '<p style="margin:20px 0">' + altaFamBoton_(g.accessUrl, 'Crear mi PIN y entrar') + '</p>' +
      '<p style="font-size:12px;color:#64748B">El botón es personal, solo vale una vez y caduca el ' + altaFamFecha_(g.expiresAt) +
      '. Después entrarás siempre en ' + kiruEscapar(loginUrl) + ' con tu usuario y tu PIN.</p>';
    texto += 'Ya tenéis cuenta en la Plataforma Kiru para seguir a ' + alumnoPila + '.\nTu usuario: ' + g.username +
      '\nCrea tu PIN (6 números) y entra: ' + g.accessUrl + '\nEl enlace es personal, vale una vez y caduca el ' + altaFamFecha_(g.expiresAt) + '.\n\n';
  } else {
    html += '<p>Hemos añadido a <strong>' + kiruEscapar(alumnoPila) + '</strong> a tu cuenta de la Plataforma Kiru. Entra como siempre con tu usuario <strong>' +
      kiruEscapar(g.username) + '</strong> y tu PIN.</p><p style="margin:20px 0">' + altaFamBoton_(loginUrl, 'Entrar en la Plataforma Kiru') + '</p>';
    texto += 'Hemos añadido a ' + alumnoPila + ' a tu cuenta de la Plataforma Kiru. Entra en ' + loginUrl + ' con tu usuario ' + g.username + ' y tu PIN.\n\n';
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

/** Número para wa.me: 9 cifras españolas → 34…; con prefijo internacional se deja. */
function altaFamWhatsapp_(telefono) {
  var d = String(telefono || '').replace(/[^0-9+]/g, '');
  var internacional = d.indexOf('+') === 0 || d.indexOf('00') === 0;
  d = d.replace(/^\+|^00/, '').replace(/\D/g, '');
  if (/^[6789]\d{8}$/.test(d)) return '34' + d;
  if (internacional && /^\d{10,15}$/.test(d)) return d;
  return '';
}

function altaFamHtmlFamilia_(fam, res, sinCorreo) {
  var etiquetas = { created: 'cuenta nueva, acceso enviado', link: 'ya tenía cuenta sin estrenar, acceso enviado de nuevo',
    active: 'ya tenía cuenta, se le ha añadido el alumno y se le ha avisado', already: 'ya estaba hecho' };
  var html = '<div style="margin:0 0 20px;padding:16px;border:1px solid #E7E2D8;border-radius:12px">' +
    '<p style="margin:0 0 8px;font-size:16px"><strong>' + kiruEscapar(fam.alumno) + '</strong></p><ul style="margin:0;padding-left:18px">';
  if (res) {
    var s = res.student;
    var dondeAlumno = res.guardians.filter(function (g) { return g.conAlumno; })[0];
    html += '<li>Alumno: @' + kiruEscapar(s.username) + ' — ' + (s.status === 'created'
      ? 'cuenta nueva' + (dondeAlumno ? '; su botón para crear el PIN ha ido a ' + kiruEscapar(dondeAlumno.email)
        : '; <strong style="color:#B91C1C">su botón para crear el PIN no se ha podido enviar: ponle un PIN desde el panel de administración («Contraseña»)</strong>')
      : 'ya existía') + '. ID para Contabilidad: <code>' + kiruEscapar(s.id) + '</code></li>';
    res.guardians.forEach(function (g) {
      html += '<li>' + kiruEscapar(g.fullName) + ' (' + kiruEscapar(g.email) + ')' + (g.username ? ' @' + kiruEscapar(g.username) : '') + ' — ' +
        (g.status === 'error' ? '<strong style="color:#B91C1C">' + kiruEscapar(g.error) + '</strong>' : etiquetas[g.status]) + '</li>';
    });
  } else {
    html += '<li>No se ha creado ninguna cuenta todavía: ningún tutor ha dado un correo válido.</li>';
  }
  html += '</ul>';
  var alumnoPila = fam.alumno.split(/\s+/)[0];
  sinCorreo.forEach(function (t) {
    var pila = String(t.nombre).split(/\s+/)[0];
    var mensaje = 'Hola' + (/^tutor \d$/i.test(t.nombre) ? '' : ' ' + pila) + ', soy Sofía de Método Kiru. Para darte acceso a la Plataforma Kiru y que puedas seguir el progreso de ' +
      alumnoPila + ', necesito tu correo electrónico. ¿Me lo puedes mandar por aquí? ¡Gracias!';
    var numero = altaFamWhatsapp_(t.telefono);
    var url = 'https://wa.me/' + numero + '?text=' + encodeURIComponent(mensaje);
    html += '<p style="margin:14px 0 6px">Falta el correo de <strong>' + kiruEscapar(t.nombre) + '</strong>' +
      (numero ? '' : ' (no hay un teléfono válido en la hoja: WhatsApp te dejará elegir el contacto)') + '.</p>' +
      '<p style="margin:0 0 6px">' + altaFamBoton_(url, 'Pedírselo por WhatsApp', '#1F8F4E') + '</p>' +
      '<p style="margin:0;font-size:12px;color:#64748B">Cuando te lo dé, escríbelo en su casilla «Correo electrónico del progenitor/tutor ' + t.n +
      '» de la hoja y en 10 minutos tendrá su cuenta y su correo de acceso.</p>';
  });
  return html + '</div>';
}

function altaFamEnviarResumen_(lineas) {
  var hoja = 'https://docs.google.com/spreadsheets/d/' + ALTA_FAM.HOJA_ID + '/edit';
  var html = '<p>Hola Sofía:</p><p>Esto es lo que se ha hecho en el Campus con las respuestas nuevas del formulario de familias:</p>' +
    lineas.map(function (l) { return l.html; }).join('') +
    '<p style="font-size:12px;color:#64748B">Puedes verlo también en la columna CAMPUS ALTA de <a href="' + hoja + '">Familias Kiru (respuestas)</a>.</p>';
  var texto = 'Altas en el Campus:\n\n' + lineas.map(function (l) { return '- ' + l.texto; }).join('\n') + '\n\nHoja: ' + hoja;
  GmailApp.sendEmail(ALTA_FAM.AVISO, 'Método Kiru | Altas de familias en el Campus', texto, { htmlBody: html, name: KIRU_REMITENTE });
}
