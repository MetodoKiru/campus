/*******************************************************
 * MÉTODO KIRU · RENOVACIONES DE FAMILIAS (con el campus)
 * Va dentro de la hoja «Contabilidad 26-27»
 * (Extensiones > Apps Script). Sustituye a Código.gs.
 *
 * Qué hace cada día a las 9:00:
 *  - 7 días antes del fin de la mensualidad: correo de renovación
 *    (con datos del Registro de sesión, opciones de plan, pago y Calendly)
 *    y el mismo aviso en el panel de la familia en el campus.
 *  - 2 días antes, si no se ha registrado el pago: recordatorio corto.
 *  - El día del fin, si no se ha registrado el pago: aviso a Sofía.
 * El pago se detecta solo: al apuntar el ingreso en «Ingresos»,
 * la fecha de fin de la pestaña «Familias» avanza.
 * En modo «borrador» los correos quedan en Borradores de Gmail.
 *
 * NUEVO (31/10/2026): botones «No renovamos» y «Ya he pagado», y conexión
 * con el campus. La familia puede responder en el correo o en el campus y
 * vale la primera respuesta: el campus hace de árbitro, así que no se
 * apunta ni se avisa dos veces. Cada 10 minutos se copia a la hoja lo que
 * se ha respondido en el campus («Plan elegido» y la columna R).
 * Necesita la propiedad del script KIRU_ALTA_SECRET (la misma clave de los
 * avisos a familias). Sin ella, todo funciona como antes, solo por correo.
 *******************************************************/

const CFG = {
  HOJA_FAMILIAS: 'Familias',
  HOJA_CONFIG: 'Config renovación',
  REGISTRO_ID: '1bgZYmXc4uol1GvfyD7QaAIdnK37OG3hLC27jMVg6A1c',
  REGISTRO_HOJA: 'Respuestas de formulario 1',
  DIAS_AVISO: 7,
  DIAS_RECORDATORIO: 2,
  DIAS_HISTORIAL: 35, // sesiones que se miran para el resumen del mes
  ZONA: 'Europe/Madrid',
  CAMPUS_URL: 'https://campus.metodokiru.es',
};

// Columnas de «Familias» (A = 1)
const COL = {
  ALUMNO: 1, MENTOR: 2, PADRE: 3, EMAIL: 4, DIAS: 5, TARIFA: 6, PAGA: 7,
  FIN: 10, PLAN: 12, NOTAS: 13, PRECIO_SUBE: 14,
  ENV_AVISO: 15, ENV_RECORDATORIO: 16, ENV_IMPAGO: 17,
  DICE_PAGADO: 18, // NUEVO: «La familia dice que ha pagado»
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Lo que se escribe en «Plan elegido próximo mes» para cada opción.
const PLAN_HOJA = { mantener: 'Mantener plan', subir: '+1 día', no_renueva: 'No renueva' };

/* ================= MENÚ ================= */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Kiru')
    .addItem('Crear borrador de renovación (fila seleccionada)', 'borradorFilaSeleccionada')
    .addItem('Activar revisión diaria (9:00)', 'instalarRevisionDiaria')
    .addItem('Conectar con el campus (cada 10 min)', 'instalarSincronizacionCampus')
    .addToUi();
}

function instalarRevisionDiaria() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'revisarRenovaciones')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisarRenovaciones')
    .timeBased().everyDays(1).atHour(9).inTimezone(CFG.ZONA).create();
  SpreadsheetApp.getActive().toast('Revisión diaria activada a las 9:00.', 'Kiru', 5);
}

function instalarSincronizacionCampus() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sincronizarRenovacionesCampus')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sincronizarRenovacionesCampus').timeBased().everyMinutes(10).create();
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.HOJA_FAMILIAS);
  if (!sh.getRange(1, COL.DICE_PAGADO).getValue()) sh.getRange(1, COL.DICE_PAGADO).setValue('La familia dice que ha pagado');
  if (!PropertiesService.getScriptProperties().getProperty('KIRU_ALTA_SECRET')) {
    throw new Error('Falta la propiedad del script KIRU_ALTA_SECRET (Configuración del proyecto > Propiedades del script).');
  }
  const n = publicarRenovacionesEnCurso_();
  sincronizarRenovacionesCampus();
  const msg = 'Conectado con el campus: se revisa cada 10 minutos. Renovaciones de este mes llevadas al campus: ' + n + '.';
  console.log(msg);
  try { SpreadsheetApp.getActive().toast(msg, 'Kiru', 8); } catch (e) { /* sin hoja abierta */ }
}

function borradorFilaSeleccionada() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getActiveSheet();
  if (sh.getName() !== CFG.HOJA_FAMILIAS) {
    SpreadsheetApp.getUi().alert('Ve a la pestaña «Familias» y selecciona la fila de la familia.');
    return;
  }
  const fila = sh.getActiveRange().getRow();
  if (fila < 2) { SpreadsheetApp.getUi().alert('Selecciona la fila de una familia.'); return; }
  const fam = leerFamilia_(sh.getRange(fila, 1, 1, COL.DICE_PAGADO).getValues()[0]);
  if (!fam.alumno || !fam.email || !fam.fin) {
    SpreadsheetApp.getUi().alert('A esta fila le falta el alumno, el email o la fecha de fin.');
    return;
  }
  const correo = correoRenovacion_(fam, config_());
  GmailApp.createDraft(fam.email, correo.asunto, correo.texto, { htmlBody: correo.html, name: 'Método Kiru' });
  ss.toast('Borrador creado para ' + fam.alumno + '. Míralo en Borradores de Gmail.', 'Kiru', 6);
}

/* ================= REVISIÓN DIARIA ================= */

function revisarRenovaciones() {
  const cfg = config_();
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.HOJA_FAMILIAS);
  const datos = sh.getRange(1, 1, sh.getLastRow(), Math.max(sh.getLastColumn(), COL.DICE_PAGADO)).getValues();
  const hoy = hoy_();
  const impagos = [];

  for (let i = 1; i < datos.length; i++) {
    const fam = leerFamilia_(datos[i]);
    if (!fam.alumno || !fam.email || !fam.fin) continue;
    if (fam.plan === 'No renueva') continue;
    const fila = i + 1;
    const diaAviso = sumarDias_(fam.fin, -CFG.DIAS_AVISO);
    const diaRecordatorio = sumarDias_(fam.fin, -CFG.DIAS_RECORDATORIO);

    // 1) Correo de renovación (si se pasó el día, se manda igualmente antes del fin)
    if (hoy >= diaAviso && hoy < fam.fin && !mismoDia_(fam.envAviso, fam.fin)) {
      // Mensualidad nueva: se borra la elección del mes anterior.
      sh.getRange(fila, COL.PLAN).setValue('');
      sh.getRange(fila, COL.DICE_PAGADO).setValue('');
      fam.plan = ''; fam.dicePagado = '';
      entregar_(fam, correoRenovacion_(fam, cfg), cfg, 'renovación');
      sh.getRange(fila, COL.ENV_AVISO).setValue(fam.fin);
      campusPublicar_(fam, cfg);
    }
    // 2) Recordatorio (solo si ya salió el de renovación y sigue sin pago)
    else if (mismoDia_(hoy, diaRecordatorio) && mismoDia_(fam.envAviso, fam.fin)
             && !mismoDia_(fam.envRecordatorio, fam.fin)) {
      entregar_(fam, correoRecordatorio_(fam, cfg), cfg, 'recordatorio');
      sh.getRange(fila, COL.ENV_RECORDATORIO).setValue(fam.fin);
    }
    // 3) Día del fin sin pago registrado
    if (mismoDia_(hoy, fam.fin) && !mismoDia_(fam.envImpago, fam.fin)) {
      impagos.push(fam);
      sh.getRange(fila, COL.ENV_IMPAGO).setValue(fam.fin);
    }
  }

  if (impagos.length) {
    const lista = impagos.map(f => '- ' + f.alumno + ' (' + f.padre + ', ' + f.email + ')'
      + (f.plan ? ' · eligió: ' + f.plan : ' · no ha elegido plan')
      + (f.dicePagado ? ' · dice que ha pagado (' + f.dicePagado + ')' : '')).join('\n');
    MailApp.sendEmail(cfg.emailAvisos, 'Kiru · Mensualidades que acaban hoy sin pago registrado',
      'Hoy acaba la mensualidad de estas familias y no hay pago apuntado en «Ingresos»:\n\n'
      + lista + '\n\nSi ya han pagado, apunta el ingreso en Contabilidad. Si no, escríbeles por WhatsApp.');
  }
}

function entregar_(fam, correo, cfg, tipo) {
  const opciones = { htmlBody: correo.html, name: 'Método Kiru' };
  if (cfg.modo === 'enviar') {
    GmailApp.sendEmail(fam.email, correo.asunto, correo.texto, opciones);
  } else {
    GmailApp.createDraft(fam.email, correo.asunto, correo.texto, opciones);
    MailApp.sendEmail(cfg.emailAvisos, 'Kiru · Borrador listo: ' + tipo + ' de ' + fam.alumno,
      'Tienes en Borradores de Gmail el correo de ' + tipo + ' para ' + fam.padre
      + ' (' + fam.email + '). Revísalo y pulsa Enviar.\n\nLa mensualidad acaba el ' + fmt_(fam.fin) + '.'
      + (tipo === 'renovación' ? '\n\nOjo: la familia ya ve la propuesta en su panel del campus con los precios de la hoja. Si cambias un precio en el borrador, cámbialo también en la hoja (columna «Precio si sube»).' : ''));
  }
}

/* ================= CORREOS ================= */

function correoRenovacion_(fam, cfg) {
  const d = datosDelMes_(fam.alumno, sumarDias_(fam.fin, -CFG.DIAS_HISTORIAL), hoy_());
  const op = opciones_(fam, cfg);
  const nombre = primerNombre_(fam.alumno);
  const mesSig = MESES[fam.fin.getMonth()];
  const asunto = 'Renovación de la mensualidad de ' + nombre + ' · Método Kiru';

  let h = estiloInicio_();
  h += p_('Hola, ' + esc_(primerNombre_(fam.padre)) + ':');
  h += p_('El ' + fechaLarga_(fam.fin) + ' termina la mensualidad de ' + esc_(nombre)
    + '. Antes de renovar, queremos contarte cómo ha ido este mes.');

  const items = [];
  if (d.sesiones) items.push(d.sesiones + (d.sesiones === 1 ? ' sesión realizada.' : ' sesiones realizadas.'));
  d.logros.forEach((l, k) => items.push('<b>' + (k === 0 ? 'Gran logro' : 'También ha conseguido') + ':</b> «' + esc_(l) + '».'));
  if (d.trabajando) items.push('<b>Lo que seguimos trabajando:</b> ' + esc_(minus_(d.trabajando)) + '.');
  if (d.recomendacion) items.push('<b>Recomendación para casa:</b> ' + esc_(d.recomendacion) + '.');
  if (items.length) {
    h += '<p style="margin:18px 0 6px"><b>Este mes con ' + esc_(fam.mentor || 'su mentor') + '</b></p>';
    h += '<ul style="margin:0 0 12px 18px;padding:0">' + items.map(x => '<li style="margin:4px 0">' + x + '</li>').join('') + '</ul>';
  }

  h += '<p style="margin:18px 0 6px"><b>¿Cómo seguimos?</b></p><ul style="margin:0 0 12px 18px;padding:0">';
  h += '<li style="margin:4px 0"><b>' + op.mantener.etiqueta + ':</b> ' + euros_(op.mantener.precio) + '/mes.</li>';
  if (op.subir) {
    const area = d.trabajando ? minus_(d.trabajando) : 'la organización y la rutina de estudio';
    h += '<li style="margin:4px 0"><b>' + op.subir.etiqueta + ' (recomendado):</b> ' + euros_(op.subir.precio)
      + '/mes. Con una sesión más a la semana, ' + esc_(fam.mentor || 'su mentor')
      + ' puede dedicar más tiempo a ' + esc_(area) + ' y consolidar lo que ' + esc_(nombre)
      + ' está empezando a conseguir.</li>';
  }
  h += '</ul>';
  h += botones_(fam, op, cfg, false);

  if (cfg.datosPagoEnCorreo) h += p_(bloquePago_(cfg, nombre, mesSig));
  else h += p_('Al elegir tu opción verás el importe y los datos para el pago.');
  h += pieBotones_(fam, cfg);

  if (cfg.calendly) {
    h += p_('Si prefieres hablar con calma sobre la continuidad de ' + esc_(nombre)
      + ', puedes reservar una llamada conmigo: <a href="' + esc_(cfg.calendly) + '">Reservar llamada</a>');
  }
  h += p_('Un abrazo,<br>' + esc_(cfg.firma));
  h += '</div>';

  return { asunto: asunto, html: h, texto: textoPlano_(h) };
}

function correoRecordatorio_(fam, cfg) {
  const op = opciones_(fam, cfg);
  const nombre = primerNombre_(fam.alumno);
  const asunto = 'Recordatorio: la mensualidad de ' + nombre + ' acaba el ' + fechaLarga_(fam.fin);
  let h = estiloInicio_();
  h += p_('Hola, ' + esc_(primerNombre_(fam.padre)) + ':');
  h += p_('Te recordamos que la mensualidad de ' + esc_(nombre) + ' termina el ' + fechaLarga_(fam.fin)
    + '. Para que no se interrumpan las sesiones, elige cómo queréis seguir:');
  h += botones_(fam, op, cfg, true);
  if (cfg.datosPagoEnCorreo) h += p_(bloquePago_(cfg, nombre, MESES[fam.fin.getMonth()]));
  h += pieBotones_(fam, cfg);
  h += p_('Si ya lo habéis pagado, ¡gracias! Puedes ignorar este correo.');
  if (cfg.calendly) h += p_('¿Lo hablamos? <a href="' + esc_(cfg.calendly) + '">Reservar llamada</a>');
  h += p_('Un abrazo,<br>' + esc_(cfg.firma)) + '</div>';
  return { asunto: asunto, html: h, texto: textoPlano_(h) };
}

// Botones de plan (mantener / un día más). Con precio en el recordatorio.
function botones_(fam, op, cfg, conPrecio) {
  let h = '<p style="margin:14px 0">';
  h += boton_(op.mantener.etiqueta + (conPrecio ? ' · ' + euros_(op.mantener.precio) : ''), enlacePlan_(fam, 'mantener', cfg), false);
  if (op.subir) h += ' ' + boton_(op.subir.etiqueta + (conPrecio ? ' · ' + euros_(op.subir.precio) : ''), enlacePlan_(fam, 'subir', cfg), true);
  return h + '</p>';
}

// «Ya he pagado», «No renovamos» y el aviso de que también se puede responder en el campus.
function pieBotones_(fam, cfg) {
  let h = '<p style="margin:14px 0">' + boton_('Ya he pagado', enlacePlan_(fam, 'pagado', cfg), false) + '</p>';
  h += p_('<span style="color:#555">¿No vais a seguir? <a href="' + esc_(enlacePlan_(fam, 'no', cfg)) + '">No renovamos</a>.'
    + ' También podéis responder desde vuestro panel del campus: <a href="' + CFG.CAMPUS_URL + '">' + CFG.CAMPUS_URL.replace('https://', '') + '</a>.</span>');
  return h;
}

function bloquePago_(cfg, nombre, mes) {
  let t = '<b>Pago:</b> ';
  const partes = [];
  if (cfg.bizum) partes.push('Bizum al ' + esc_(cfg.bizum));
  if (cfg.iban) partes.push('transferencia a ' + esc_(cfg.iban) + (cfg.titular ? ' (titular: ' + esc_(cfg.titular) + ')' : ''));
  t += partes.join(' o ') + '. En el concepto, pon «' + esc_(nombre) + ' + ' + mes + '».';
  t += ' Envía el comprobante a ' + esc_(cfg.emailAvisos) + '.';
  return t;
}

/* ================= DATOS DEL REGISTRO DE SESIÓN ================= */

function datosDelMes_(alumno, desde, hasta) {
  const vacio = { sesiones: 0, logros: [], trabajando: '', recomendacion: '' };
  let filas;
  try {
    filas = SpreadsheetApp.openById(CFG.REGISTRO_ID).getSheetByName(CFG.REGISTRO_HOJA).getDataRange().getValues();
  } catch (e) { return vacio; }
  const cab = filas[0].map(norm_);
  const col = texto => cab.findIndex(c => c.indexOf(norm_(texto)) === 0);
  const iAlumno = col('Alumno'), iFecha = col('Fecha de la sesion');
  const iLogroSemana = col('¿Cual ha sido el principal logro del alumno esta semana');
  const iLogroSesion = col('¿Cual ha sido el mayor logro de esta sesion');
  const iSeguir = col('Aspecto que seguiremos trabajando');
  const iCostado = col('¿Que ha sido lo que mas le ha costado esta semana');
  const iRecom = col('Recomendacion para la familia');
  if (iAlumno < 0 || iFecha < 0) return vacio;

  const a = norm_(alumno);
  const ses = filas.slice(1).filter(r => {
    const n = norm_(r[iAlumno]);
    if (!n || !(n === a || n.indexOf(a) === 0 || a.indexOf(n) === 0)) return false;
    const f = aFecha_(r[iFecha]);
    return f && f >= desde && f <= hasta;
  }).sort((x, y) => aFecha_(y[iFecha]) - aFecha_(x[iFecha])); // más reciente primero

  const util = v => {
    const s = String(v || '').trim();
    return s.length > 3 && !/primera sesi/i.test(s) && !/^(nada|no|si|sí)\b/i.test(s) ? s.replace(/\.+$/, '') : '';
  };
  const logros = [];
  [iLogroSemana, iLogroSesion].forEach(idx => {
    if (idx < 0) return;
    ses.forEach(r => { const v = util(r[idx]); if (v && logros.length < 2 && logros.indexOf(v) < 0) logros.push(v); });
  });
  const primero = idxs => {
    for (const r of ses) for (const idx of idxs) { if (idx >= 0) { const v = util(r[idx]); if (v) return v; } }
    return '';
  };
  return {
    sesiones: ses.length,
    logros: logros,
    trabajando: primero([iSeguir, iCostado]),
    recomendacion: primero([iRecom]),
  };
}

/* ================= ELECCIÓN DE PLAN (página web) ================= */
// Se publica como aplicación web. Al cambiar el código: Implementar >
// Gestionar implementaciones > editar (lápiz) > Versión: Nueva versión.
// Así el enlace no cambia y los correos ya enviados siguen funcionando.

function doGet(e) {
  const a = (e && e.parameter.a) || '', p = (e && e.parameter.p) || '', t = (e && e.parameter.t) || '';
  if (!a || t !== token_(a) || ['mantener', 'subir', 'no', 'pagado'].indexOf(p) < 0) {
    return pagina_('Enlace no válido', 'Este enlace no es válido. Escríbenos a metodokiru@gmail.com y lo vemos.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // dos pulsaciones a la vez no se pisan
  try {
    const cfg = config_();
    const sh = SpreadsheetApp.getActive().getSheetByName(CFG.HOJA_FAMILIAS);
    const datos = sh.getRange(1, 1, sh.getLastRow(), Math.max(sh.getLastColumn(), COL.DICE_PAGADO)).getValues();
    for (let i = 1; i < datos.length; i++) {
      const fam = leerFamilia_(datos[i]);
      if (norm_(fam.alumno) !== norm_(a)) continue;
      return p === 'pagado' ? respuestaPagado_(sh, i + 1, fam, cfg) : respuestaPlan_(sh, i + 1, fam, p === 'no' ? 'no_renueva' : p, cfg);
    }
    return pagina_('No encontrado', 'No hemos encontrado la ficha. Escríbenos a metodokiru@gmail.com.');
  } finally {
    lock.releaseLock();
  }
}

function respuestaPlan_(sh, fila, fam, plan, cfg) {
  const ops = opciones_(fam, cfg);
  const nombre = primerNombre_(fam.alumno);
  // El campus decide si ya habían respondido (aquí o en la plataforma).
  const r = campusElegir_(fam, plan);
  if (r && r.found && r.already && r.plan) {
    return pagina_('Ya teníamos vuestra respuesta',
      'Para ' + esc_(nombre) + ' ya habíais elegido: <b>' + esc_(etiquetaPlan_(r.plan, ops)) + '</b>'
      + (r.plan_source === 'campus' ? ' (desde el campus)' : '') + '. No hemos cambiado nada.'
      + '<br><br>Si queréis cambiarlo, escríbenos a ' + esc_(cfg.emailAvisos) + '.');
  }
  // Sin campus (familia sin cuenta o campus caído): la hoja hace de árbitro.
  if (!(r && r.found) && fam.plan && mismoDia_(fam.envAviso, fam.fin)) {
    return pagina_('Ya teníamos vuestra respuesta',
      'Para ' + esc_(nombre) + ' ya habíais elegido: <b>' + esc_(fam.plan) + '</b>. No hemos cambiado nada.');
  }
  sh.getRange(fila, COL.PLAN).setValue(PLAN_HOJA[plan]);
  avisarEleccion_(fam, plan, ops, cfg, 'el correo');
  if (plan === 'no_renueva') {
    return pagina_('Gracias por este tiempo',
      'Hemos registrado que no renováis la mensualidad de ' + esc_(nombre) + '. ¡Gracias por confiar en Método Kiru!'
      + (cfg.calendly ? '<br><br>Si quieres contarnos algo, <a href="' + esc_(cfg.calendly) + '">reserva una llamada</a>.' : ''));
  }
  const op = ops[plan] || ops.mantener;
  return pagina_('¡Gracias!',
    'Hemos registrado tu elección para ' + esc_(nombre) + ': <b>' + op.etiqueta + '</b>, ' + euros_(op.precio) + '/mes.<br><br>'
    + bloquePago_(cfg, nombre, MESES[fam.fin.getMonth()])
    + (cfg.calendly ? '<br><br>Si quieres hablarlo, <a href="' + esc_(cfg.calendly) + '">reserva una llamada</a>.' : ''));
}

function respuestaPagado_(sh, fila, fam, cfg) {
  const nombre = primerNombre_(fam.alumno);
  const r = campusElegir_(fam, 'pagado');
  const yaEstaba = (r && r.found && r.already && r.paid_reported) || (!(r && r.found) && fam.dicePagado);
  if (yaEstaba) {
    return pagina_('¡Gracias!', 'Ya nos habíais avisado del pago de ' + esc_(nombre) + '. Lo comprobamos y os decimos si falta algo.');
  }
  sh.getRange(fila, COL.DICE_PAGADO).setValue(fmt_(hoy_()) + ' · correo');
  MailApp.sendEmail(cfg.emailAvisos, 'Kiru · ' + fam.alumno + ' dice que ha pagado',
    fam.padre + ' dice que ya ha pagado la próxima mensualidad de ' + fam.alumno + ' (fin actual: ' + fmt_(fam.fin) + ')'
    + (fam.plan ? ', plan: ' + fam.plan : ', sin plan elegido') + '. Respondido desde el correo.\n\n'
    + 'Comprueba el ingreso y apúntalo en «Ingresos»: así la fecha de fin avanza y el aviso se cierra en el campus.');
  return pagina_('¡Gracias!', 'Hemos recibido tu aviso de pago para ' + esc_(nombre) + '. Lo comprobamos y, si falta algo, te escribimos.');
}

function avisarEleccion_(fam, plan, ops, cfg, desde) {
  const op = ops[plan];
  const etiqueta = etiquetaPlan_(plan, ops);
  MailApp.sendEmail(cfg.emailAvisos, 'Kiru · ' + fam.alumno + ' ha elegido: ' + etiqueta,
    fam.padre + ' ha elegido «' + etiqueta + '»' + (op ? ' (' + euros_(op.precio) + '/mes)' : '')
    + ' para la próxima mensualidad de ' + fam.alumno + ' (fin actual: ' + fmt_(fam.fin) + '). Respondido desde ' + desde + '.');
}

function etiquetaPlan_(plan, ops) {
  if (plan === 'no_renueva') return 'No renueva';
  return (ops[plan] && ops[plan].etiqueta) || PLAN_HOJA[plan] || plan;
}

function pagina_(titulo, cuerpo) {
  const html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:40px auto;padding:0 16px;color:#222;line-height:1.5">'
    + '<h2 style="font-weight:600">' + titulo + '</h2><p>' + cuerpo + '</p><p style="color:#777">Método Kiru</p></div>';
  return HtmlService.createHtmlOutput(html).setTitle('Método Kiru')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function enlacePlan_(fam, plan, cfg) {
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
  if (url) return url + '?a=' + encodeURIComponent(fam.alumno) + '&p=' + plan + '&t=' + token_(fam.alumno);
  // Si la aplicación web no está publicada, el botón abre un correo de respuesta
  const op = opciones_(fam, cfg)[plan];
  const texto = op ? op.etiqueta : (plan === 'no' ? 'No renovamos' : 'Ya he pagado');
  return 'mailto:' + cfg.emailAvisos + '?subject=' + encodeURIComponent(primerNombre_(fam.alumno) + ': ' + texto);
}

function token_(alumno) {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SECRETO');
  if (!s) { s = Utilities.getUuid(); props.setProperty('SECRETO', s); }
  return Utilities.computeHmacSha256Signature(norm_(alumno), s)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/* ================= CAMPUS ================= */
// Todo lo del campus falla en silencio (queda en el registro de ejecuciones):
// si el campus no responde, el correo sigue funcionando como siempre.

function campus_(cuerpo) {
  const clave = PropertiesService.getScriptProperties().getProperty('KIRU_ALTA_SECRET');
  if (!clave) return null;
  try {
    const r = UrlFetchApp.fetch(CFG.CAMPUS_URL + '/api/renovaciones', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + clave },
      payload: JSON.stringify(cuerpo), muteHttpExceptions: true,
    });
    if (r.getResponseCode() !== 200) { console.error('Campus ' + r.getResponseCode() + ': ' + r.getContentText()); return null; }
    return JSON.parse(r.getContentText());
  } catch (e) {
    console.error('Campus: ' + e.message);
    return null;
  }
}

function ymd_(d) { return Utilities.formatDate(d, CFG.ZONA, 'yyyy-MM-dd'); }

function campusPublicar_(fam, cfg) {
  const op = opciones_(fam, cfg);
  const r = campus_({
    accion: 'publicar', email: fam.email, alumno: fam.alumno, fin: ymd_(fam.fin), mentor: fam.mentor,
    mantenerEtiqueta: op.mantener.etiqueta, mantenerPrecio: op.mantener.precio,
    subirEtiqueta: op.subir ? op.subir.etiqueta : '', subirPrecio: op.subir ? op.subir.precio : '',
    pago: textoPlano_(bloquePago_(cfg, primerNombre_(fam.alumno), MESES[fam.fin.getMonth()])),
    llamada: cfg.calendly,
    plan: planDeHoja_(fam.plan), pagado: !!fam.dicePagado,
  });
  if (r && r.found === false) console.log('Sin cuenta en el campus para ' + fam.alumno + ' (' + fam.email + '): solo por correo.');
  return r;
}

function planDeHoja_(texto) {
  const t = norm_(texto);
  if (t === norm_(PLAN_HOJA.mantener)) return 'mantener';
  if (t === norm_(PLAN_HOJA.subir)) return 'subir';
  if (t === norm_(PLAN_HOJA.no_renueva)) return 'no_renueva';
  return '';
}

// Al conectar por primera vez: lleva al campus las renovaciones de este mes
// que ya salieron por correo (con lo que ya hubieran elegido).
function publicarRenovacionesEnCurso_() {
  const cfg = config_();
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.HOJA_FAMILIAS);
  const datos = sh.getRange(1, 1, sh.getLastRow(), Math.max(sh.getLastColumn(), COL.DICE_PAGADO)).getValues();
  const hoy = hoy_();
  let n = 0;
  for (let i = 1; i < datos.length; i++) {
    const fam = leerFamilia_(datos[i]);
    if (!fam.alumno || !fam.email || !fam.fin || fam.fin < hoy || !mismoDia_(fam.envAviso, fam.fin)) continue;
    const r = campusPublicar_(fam, cfg);
    if (r && r.found) n++;
  }
  return n;
}

function campusElegir_(fam, accion) {
  return campus_({ accion: 'elegir', email: fam.email, alumno: fam.alumno, fin: ymd_(fam.fin), opcion: accion });
}

// Cada 10 minutos: cierra en el campus los periodos ya pagados y apunta en la
// hoja lo que las familias han respondido en el campus (y te avisa por correo).
function sincronizarRenovacionesCampus() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const cfg = config_();
    const sh = SpreadsheetApp.getActive().getSheetByName(CFG.HOJA_FAMILIAS);
    const datos = sh.getRange(1, 1, sh.getLastRow(), Math.max(sh.getLastColumn(), COL.DICE_PAGADO)).getValues();
    const familias = [];
    for (let i = 1; i < datos.length; i++) {
      const fam = leerFamilia_(datos[i]);
      if (fam.alumno && fam.email && fam.fin) familias.push({ alumno: fam.alumno, email: fam.email, fin: ymd_(fam.fin) });
    }
    const r = campus_({ accion: 'sincronizar', familias: familias });
    if (!r) return;
    const hechos = [];
    (r.pendientes || []).forEach(pend => {
      for (let i = 1; i < datos.length; i++) {
        const fam = leerFamilia_(datos[i]);
        if (norm_(fam.alumno) !== norm_(pend.alumno) || norm_(fam.email) !== norm_(pend.email)) continue;
        if (fam.fin && ymd_(fam.fin) === pend.fin) {
          const ops = opciones_(fam, cfg);
          if (pend.plan && pend.plan_source === 'campus' && fam.plan !== PLAN_HOJA[pend.plan]) {
            sh.getRange(i + 1, COL.PLAN).setValue(PLAN_HOJA[pend.plan]);
            avisarEleccion_(fam, pend.plan, ops, cfg, 'el campus');
          }
          if (pend.paid_reported_at && pend.paid_source === 'campus' && !fam.dicePagado) {
            sh.getRange(i + 1, COL.DICE_PAGADO).setValue(fmt_(hoy_()) + ' · campus');
            MailApp.sendEmail(cfg.emailAvisos, 'Kiru · ' + fam.alumno + ' dice que ha pagado',
              fam.padre + ' dice que ya ha pagado la próxima mensualidad de ' + fam.alumno + ' (fin actual: ' + fmt_(fam.fin) + ')'
              + (pend.plan ? ', plan: ' + etiquetaPlan_(pend.plan, ops) : ', sin plan elegido') + '. Respondido desde el campus.\n\n'
              + 'Comprueba el ingreso y apúntalo en «Ingresos»: así la fecha de fin avanza y el aviso se cierra en el campus.');
          }
        }
        break;
      }
      hechos.push({ id: pend.id, seq: pend.seq });
    });
    if (hechos.length) campus_({ accion: 'confirmar', items: hechos });
  } finally {
    lock.releaseLock();
  }
}

/* ================= PLANES Y CONFIGURACIÓN ================= */

function opciones_(fam, cfg) {
  const dias = Number(fam.dias) || 0;
  const precioActual = Number(fam.paga) || Number(fam.tarifa) || 0;
  const r = { mantener: { etiqueta: 'Mantener ' + dias + (dias === 1 ? ' día' : ' días') + ' por semana', precio: precioActual } };
  if (dias && dias < cfg.maxDias) {
    const precio = Number(fam.precioSube) || Number(cfg.tarifas[dias + 1]) || 0;
    if (precio) r.subir = { etiqueta: 'Pasar a ' + (dias + 1) + ' días por semana', precio: precio };
  }
  return r;
}

function config_() {
  const filas = SpreadsheetApp.getActive().getSheetByName(CFG.HOJA_CONFIG).getDataRange().getValues();
  const m = {};
  filas.forEach(r => { if (r[0]) m[String(r[0]).trim()] = r[1]; });
  const tarifas = {};
  Object.keys(m).forEach(k => { const x = k.match(/^Tarifa (\d+)$/); if (x) tarifas[+x[1]] = m[k]; });
  return {
    modo: norm_(m['Modo']) === 'enviar' ? 'enviar' : 'borrador',
    emailAvisos: String(m['Email avisos'] || 'metodokiru@gmail.com').trim(),
    firma: String(m['Firma'] || 'Método Kiru'),
    calendly: String(m['Calendly'] || '').trim(),
    bizum: String(m['Bizum'] || '').trim(),
    iban: String(m['IBAN'] || '').trim(),
    titular: String(m['Titular'] || '').trim(),
    datosPagoEnCorreo: norm_(m['Datos de pago en el correo']).indexOf('s') === 0,
    tarifas: tarifas,
    maxDias: Number(m['Máximo días']) || 3,
  };
}

function leerFamilia_(r) {
  const v = c => r[c - 1];
  return {
    alumno: String(v(COL.ALUMNO) || '').trim(), mentor: String(v(COL.MENTOR) || '').trim(),
    padre: String(v(COL.PADRE) || '').trim(), email: String(v(COL.EMAIL) || '').trim(),
    dias: v(COL.DIAS), tarifa: v(COL.TARIFA), paga: v(COL.PAGA), fin: aFecha_(v(COL.FIN)),
    plan: String(v(COL.PLAN) || '').trim(), precioSube: v(COL.PRECIO_SUBE),
    envAviso: aFecha_(v(COL.ENV_AVISO)), envRecordatorio: aFecha_(v(COL.ENV_RECORDATORIO)),
    envImpago: aFecha_(v(COL.ENV_IMPAGO)),
    dicePagado: String(v(COL.DICE_PAGADO) || '').trim(),
  };
}

/* ================= UTILIDADES ================= */

function hoy_() { return aFecha_(new Date()); }
function aFecha_(v) {
  if (v instanceof Date && !isNaN(v)) {
    const s = Utilities.formatDate(v, CFG.ZONA, 'yyyy-MM-dd').split('-');
    return new Date(+s[0], +s[1] - 1, +s[2]);
  }
  if (typeof v === 'number' && v > 30000) return aFecha_(new Date(Math.round((v - 25569) * 86400000)));
  const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}
function mismoDia_(a, b) { return !!(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()); }
function sumarDias_(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmt_(d) { return d ? ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear() : ''; }
function fechaLarga_(d) { return d.getDate() + ' de ' + MESES[d.getMonth()]; }
function norm_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function primerNombre_(s) { const n = String(s || '').trim().split(/\s+/)[0] || ''; return n.charAt(0).toUpperCase() + n.slice(1); }
function minus_(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
function euros_(n) { return Number(n).toLocaleString('es-ES') + ' €'; }
function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function p_(t) { return '<p style="margin:12px 0">' + t + '</p>'; }
function estiloInicio_() { return '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:560px">'; }
function boton_(texto, url, principal) {
  return '<a href="' + esc_(url) + '" style="display:inline-block;margin:4px 6px 4px 0;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:bold;'
    + (principal ? 'background:#111;color:#fff;border:1px solid #111' : 'background:#fff;color:#111;border:1px solid #111') + '">' + esc_(texto) + '</a>';
}
function textoPlano_(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li)>/gi, '\n').replace(/<li[^>]*>/gi, '- ')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2: $1')
    .replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}
