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
 * NUEVO (31/10/2026, 2): la mensualidad en curso está siempre en el panel de
 * la familia, que puede dejar pagado el mes siguiente cuando quiera, o varios
 * meses por adelantado con los descuentos de la web (3 meses −5 %, 6 meses
 * −10 %, curso completo −15 %; si quedan menos meses hasta junio, el tramo que
 * toque). El descuento se calcula sobre la tarifa normal y la familia paga el
 * precio más bajo: el suyo de siempre o el de pago adelantado (no se suman).
 * Lo elegido se apunta en «Plan elegido» así: «Mantener plan · 3 meses».
 * Al apuntar el pago en «Ingresos», pon en «Servicio hasta» la fecha de
 * fin de esos meses (mismo día del mes): la fecha de fin avanza sola.
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
  FIN_CURSO: { mes: 5, dia: 30 }, // 30 de junio (enero = 0)
  // Descuentos por pago adelantado (los de la web): [desde N meses, % de descuento]
  DESCUENTOS_ADELANTADO: [[10, 15], [6, 10], [3, 5]],
};

// Columnas de «Familias» (A = 1)
const COL = {
  ALUMNO: 1, MENTOR: 2, PADRE: 3, EMAIL: 4, DIAS: 5, TARIFA: 6, PAGA: 7,
  DESCUENTO: 8, MOTIVO_DESCUENTO: 9, FIN: 10, PLAN: 12, NOTAS: 13, PRECIO_SUBE: 14,
  ENV_AVISO: 15, ENV_RECORDATORIO: 16, ENV_IMPAGO: 17,
  DICE_PAGADO: 18, // NUEVO: «La familia dice que ha pagado»
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Lo que se escribe en «Plan elegido próximo mes» para cada opción.
const PLAN_HOJA = { mantener: 'Mantener plan', subir: '+1 día', no_renueva: 'No renueva' };
// Con pago adelantado: «Mantener plan · 3 meses».
function planHoja_(plan, meses) { return PLAN_HOJA[plan] + (meses > 1 ? ' · ' + meses + ' meses' : ''); }

/* ================= MENÚ ================= */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Kiru')
    .addItem('Crear borrador de renovación (fila seleccionada)', 'borradorFilaSeleccionada')
    .addItem('Enviarme una prueba del correo (fila seleccionada)', 'pruebaFilaSeleccionada')
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

// Manda el correo de renovación de la fila seleccionada a «Email avisos», no a la familia
function pruebaFilaSeleccionada() {
  const sh = SpreadsheetApp.getActive().getActiveSheet();
  if (sh.getName() !== CFG.HOJA_FAMILIAS) {
    SpreadsheetApp.getUi().alert('Ve a la pestaña «Familias» y selecciona la fila de la familia.');
    return;
  }
  const fila = sh.getActiveRange().getRow();
  if (fila < 2) { SpreadsheetApp.getUi().alert('Selecciona la fila de una familia.'); return; }
  enviarPrueba_(fila);
}

// También se puede ejecutar desde el editor: manda la prueba de la primera familia con datos
function enviarPruebaRenovacion() {
  const datos = SpreadsheetApp.getActive().getSheetByName(CFG.HOJA_FAMILIAS).getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    const fam = leerFamilia_(datos[i]);
    if (fam.alumno && fam.fin) return enviarPrueba_(i + 1);
  }
}

function enviarPrueba_(fila) {
  const cfg = config_();
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.HOJA_FAMILIAS);
  const fam = leerFamilia_(sh.getRange(fila, 1, 1, COL.DICE_PAGADO).getValues()[0]);
  const correo = correoRenovacion_(fam, cfg);
  MailApp.sendEmail({
    to: cfg.emailAvisos, name: 'Método Kiru',
    subject: '[PRUEBA] ' + correo.asunto,
    htmlBody: '<p style="font-family:Arial,sans-serif;color:#a5650c"><b>Esto es una prueba:</b> así le llegaría a '
      + esc_(fam.padre || fam.email) + '. A la familia no se le ha enviado nada.</p>' + correo.html,
  });
  try { SpreadsheetApp.getActive().toast('Prueba enviada a ' + cfg.emailAvisos, 'Kiru', 6); } catch (e) {}
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
      // Mensualidad nueva: se borra la elección del mes anterior...
      fam.plan = ''; fam.dicePagado = '';
      // ...salvo que ya hayan respondido para esta en el campus (la tarjeta está siempre visible).
      const r = campusPublicar_(fam, cfg);
      if (r && r.found && r.plan) fam.plan = planHoja_(r.plan, r.meses || 1);
      if (r && r.found && r.paid_reported) fam.dicePagado = fmt_(hoy) + ' · ' + (r.paid_source || 'campus');
      sh.getRange(fila, COL.PLAN).setValue(fam.plan);
      sh.getRange(fila, COL.DICE_PAGADO).setValue(fam.dicePagado);
      // Si ya eligieron, no se les pregunta otra vez: solo se apunta como enviado.
      if (!fam.plan) entregar_(fam, correoRenovacion_(fam, cfg), cfg, 'renovación');
      sh.getRange(fila, COL.ENV_AVISO).setValue(fam.fin);
      if (fam.plan === PLAN_HOJA.no_renueva) continue;
    }
    // 2) Recordatorio (solo si ya salió el de renovación y sigue sin pago)
    else if (mismoDia_(hoy, diaRecordatorio) && mismoDia_(fam.envAviso, fam.fin)
             && !mismoDia_(fam.envRecordatorio, fam.fin) && !fam.dicePagado) {
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
  h += '<li style="margin:4px 0"><b>' + op.mantener.etiqueta + ':</b> ' + precioConDescuento_(fam, op.mantener.precio) + '/mes.</li>';
  if (op.subir) {
    const area = d.trabajando ? minus_(d.trabajando) : 'la organización y la rutina de estudio';
    h += '<li style="margin:4px 0"><b>' + op.subir.etiqueta + ' (recomendado):</b> ' + euros_(op.subir.precio)
      + '/mes. Con una sesión más a la semana, ' + esc_(fam.mentor || 'su mentor')
      + ' puede dedicar más tiempo a ' + esc_(area) + ' y consolidar lo que ' + esc_(nombre)
      + ' está empezando a conseguir.</li>';
  }
  h += '</ul>';
  h += botones_(fam, op, cfg, false);
  h += bloqueAdelantado_(fam, cfg);

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
  if (fam.plan) {
    h += p_('Te recordamos que la mensualidad de ' + esc_(nombre) + ' termina el ' + fechaLarga_(fam.fin)
      + '. Ya nos dijisteis cómo seguir (<b>' + esc_(fam.plan) + '</b>), ¡gracias! Solo falta el pago.');
  } else {
    h += p_('Te recordamos que la mensualidad de ' + esc_(nombre) + ' termina el ' + fechaLarga_(fam.fin)
      + '. Para que no se interrumpan las sesiones, elige cómo queréis seguir:');
    h += botones_(fam, op, cfg, true);
    h += bloqueAdelantado_(fam, cfg);
  }
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

// Pago por adelantado: un enlace por opción (plan y meses), con el ahorro.
function bloqueAdelantado_(fam, cfg) {
  const op = opciones_(fam, cfg);
  const ad = adelantado_(fam, cfg);
  const lineas = [];
  ['mantener', 'subir'].forEach(plan => {
    if (!op[plan] || !ad[plan].length) return;
    const enlaces = ad[plan].map(o => '<a href="' + esc_(enlacePlan_(fam, plan, cfg, o.meses)) + '">' + o.meses + ' meses: '
      + euros_(o.total) + '</a>' + (o.ahorro > 0 ? ' (ahorráis ' + euros_(o.ahorro) + ')' : ''));
    lineas.push('<li style="margin:4px 0"><b>' + op[plan].etiqueta + ':</b> ' + enlaces.join(' · ') + '</li>');
  });
  if (!lineas.length) return '';
  return '<p style="margin:14px 0 6px"><b>¿Preferís dejar pagados varios meses?</b> Con descuento:</p>'
    + '<ul style="margin:0 0 12px 18px;padding:0">' + lineas.join('') + '</ul>';
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
  const m = Number((e && e.parameter.m) || 1);
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
      return p === 'pagado' ? respuestaPagado_(sh, i + 1, fam, cfg) : respuestaPlan_(sh, i + 1, fam, p === 'no' ? 'no_renueva' : p, cfg, m);
    }
    return pagina_('No encontrado', 'No hemos encontrado la ficha. Escríbenos a metodokiru@gmail.com.');
  } finally {
    lock.releaseLock();
  }
}

function respuestaPlan_(sh, fila, fam, plan, cfg, meses) {
  const ops = opciones_(fam, cfg);
  const nombre = primerNombre_(fam.alumno);
  // Meses por adelantado: solo los que se ofrecen para ese plan.
  let opcion = null;
  if (plan !== 'no_renueva' && meses > 1) {
    opcion = (adelantado_(fam, cfg)[plan] || []).find(o => o.meses === meses) || null;
    if (!opcion) return pagina_('Enlace no válido', 'Esta opción de pago ya no está disponible. Escríbenos a ' + esc_(cfg.emailAvisos) + '.');
  }
  const n = opcion ? opcion.meses : 1;
  // El campus decide si ya habían respondido (aquí o en la plataforma).
  const r = campusElegir_(fam, plan, n);
  if (r && r.found && r.already && r.plan) {
    return pagina_('Ya teníamos vuestra respuesta',
      'Para ' + esc_(nombre) + ' ya habíais elegido: <b>' + esc_(etiquetaPlan_(r.plan, ops))
      + (r.meses > 1 ? ', ' + r.meses + ' meses por adelantado' : '') + '</b>'
      + (r.plan_source === 'campus' ? ' (desde el campus)' : '') + '. No hemos cambiado nada.'
      + '<br><br>Si queréis cambiarlo, escríbenos a ' + esc_(cfg.emailAvisos) + '.');
  }
  // Sin campus (familia sin cuenta o campus caído): la hoja hace de árbitro.
  if (!(r && r.found) && fam.plan && mismoDia_(fam.envAviso, fam.fin)) {
    return pagina_('Ya teníamos vuestra respuesta',
      'Para ' + esc_(nombre) + ' ya habíais elegido: <b>' + esc_(fam.plan) + '</b>. No hemos cambiado nada.');
  }
  sh.getRange(fila, COL.PLAN).setValue(planHoja_(plan, n));
  avisarEleccion_(fam, plan, ops, cfg, 'el correo', n, opcion ? opcion.total : null);
  if (plan === 'no_renueva') {
    return pagina_('Gracias por este tiempo',
      'Hemos registrado que no renováis la mensualidad de ' + esc_(nombre) + '. ¡Gracias por confiar en Método Kiru!'
      + (cfg.calendly ? '<br><br>Si quieres contarnos algo, <a href="' + esc_(cfg.calendly) + '">reserva una llamada</a>.' : ''));
  }
  const op = ops[plan] || ops.mantener;
  const importe = opcion
    ? n + ' meses por adelantado (hasta el ' + fechaLarga_(sumarMeses_(fam.fin, n)) + '): <b>' + euros_(opcion.total) + '</b>'
      + (opcion.ahorro > 0 ? ', ahorráis ' + euros_(opcion.ahorro) : '')
    : euros_(op.precio) + '/mes';
  return pagina_('¡Gracias!',
    'Hemos registrado tu elección para ' + esc_(nombre) + ': <b>' + op.etiqueta + '</b>, ' + importe + '.<br><br>'
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

function avisarEleccion_(fam, plan, ops, cfg, desde, meses, total) {
  const op = ops[plan];
  const etiqueta = etiquetaPlan_(plan, ops) + (meses > 1 ? ', ' + meses + ' meses por adelantado' : '');
  const importe = meses > 1 && total != null
    ? ' (' + euros_(total) + ' en total; en «Ingresos» pon «Servicio hasta» el ' + fmt_(sumarMeses_(fam.fin, meses)) + ')'
    : (op ? ' (' + euros_(op.precio) + '/mes)' : '');
  MailApp.sendEmail(cfg.emailAvisos, 'Kiru · ' + fam.alumno + ' ha elegido: ' + etiqueta,
    fam.padre + ' ha elegido «' + etiqueta + '»' + importe
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

function enlacePlan_(fam, plan, cfg, meses) {
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
  if (url) return url + '?a=' + encodeURIComponent(fam.alumno) + '&p=' + plan + (meses > 1 ? '&m=' + meses : '') + '&t=' + token_(fam.alumno);
  // Si la aplicación web no está publicada, el botón abre un correo de respuesta
  const op = opciones_(fam, cfg)[plan];
  const texto = op ? op.etiqueta + (meses > 1 ? ', ' + meses + ' meses por adelantado' : '') : (plan === 'no' ? 'No renovamos' : 'Ya he pagado');
  return 'mailto:' + cfg.emailAvisos + '?subject=' + encodeURIComponent(primerNombre_(fam.alumno) + ': ' + texto);
}

function token_(alumno) {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SECRETO');
  if (!s) { s = Utilities.getUuid(); props.setProperty('SECRETO', s); }
  return Utilities.computeHmacSha256Signature(norm_(alumno), s)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// Si la familia tiene descuento (columnas «Descuento (€)» y «Motivo descuento»), se ve tachado el precio normal
function precioConDescuento_(fam, precio) {
  const tarifa = Number(fam.tarifa) || 0;
  const desc = Number(fam.descuento) || 0;
  if (!desc || !tarifa || tarifa <= precio) return euros_(precio);
  return '<s style="color:#888">' + euros_(tarifa) + '</s> <b>' + euros_(precio) + '</b>'
    + ' (descuento de ' + euros_(desc) + (fam.motivoDescuento ? ': ' + esc_(minus_(fam.motivoDescuento)) : '') + ')';
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

// Lo que ve la familia en el campus: planes, precios y pago por adelantado.
function datosCampus_(fam, cfg) {
  const op = opciones_(fam, cfg);
  return {
    email: fam.email, alumno: fam.alumno, fin: ymd_(fam.fin), mentor: fam.mentor,
    mantenerEtiqueta: op.mantener.etiqueta, mantenerPrecio: op.mantener.precio,
    subirEtiqueta: op.subir ? op.subir.etiqueta : '', subirPrecio: op.subir ? op.subir.precio : '',
    pago: textoPlano_(bloquePago_(cfg, primerNombre_(fam.alumno), MESES[fam.fin.getMonth()])),
    llamada: cfg.calendly,
    adelantado: adelantado_(fam, cfg),
  };
}

function campusPublicar_(fam, cfg) {
  const d = datosCampus_(fam, cfg);
  d.accion = 'publicar';
  d.plan = planDeHoja_(fam.plan);
  d.meses = mesesDeHoja_(fam.plan);
  d.pagado = !!fam.dicePagado;
  const r = campus_(d);
  if (r && r.found === false) console.log('Sin cuenta en el campus para ' + fam.alumno + ' (' + fam.email + '): solo por correo.');
  return r;
}

function planDeHoja_(texto) {
  const t = norm_(String(texto || '').split('·')[0]);
  if (t === norm_(PLAN_HOJA.mantener)) return 'mantener';
  if (t === norm_(PLAN_HOJA.subir)) return 'subir';
  if (t === norm_(PLAN_HOJA.no_renueva)) return 'no_renueva';
  return '';
}

function mesesDeHoja_(texto) {
  const m = String(texto || '').match(/·\s*(\d{1,2})\s*mes/);
  return m ? Number(m[1]) : 1;
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

function campusElegir_(fam, accion, meses) {
  return campus_({ accion: 'elegir', email: fam.email, alumno: fam.alumno, fin: ymd_(fam.fin), opcion: accion, meses: meses || 1 });
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
    const desde = sumarDias_(hoy_(), -5);
    for (let i = 1; i < datos.length; i++) {
      const fam = leerFamilia_(datos[i]);
      if (!fam.alumno || !fam.email || !fam.fin) continue;
      const item = { alumno: fam.alumno, email: fam.email, fin: ymd_(fam.fin) };
      // Mensualidad en curso: siempre visible en el panel de la familia (sin campanita).
      if (fam.fin >= desde) item.datos = datosCampus_(fam, cfg);
      familias.push(item);
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
          const texto = pend.plan ? planHoja_(pend.plan, pend.meses || 1) : '';
          if (pend.plan && pend.plan_source === 'campus' && fam.plan !== texto) {
            sh.getRange(i + 1, COL.PLAN).setValue(texto);
            avisarEleccion_(fam, pend.plan, ops, cfg, 'el campus', pend.meses || 1, pend.total);
          }
          if (pend.paid_reported_at && pend.paid_source === 'campus' && !fam.dicePagado) {
            sh.getRange(i + 1, COL.DICE_PAGADO).setValue(fmt_(hoy_()) + ' · campus');
            MailApp.sendEmail(cfg.emailAvisos, 'Kiru · ' + fam.alumno + ' dice que ha pagado',
              fam.padre + ' dice que ya ha pagado la próxima mensualidad de ' + fam.alumno + ' (fin actual: ' + fmt_(fam.fin) + ')'
              + (pend.plan ? ', plan: ' + etiquetaPlan_(pend.plan, ops) + (pend.meses > 1 ? ', ' + pend.meses + ' meses por adelantado (' + euros_(pend.total) + ')' : '') : ', sin plan elegido') + '. Respondido desde el campus.\n\n'
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

// Pago por adelantado de cada plan: 3 y 6 meses, y hasta final de curso.
// Descuento sobre la tarifa normal; si la familia ya paga menos, paga lo suyo.
function adelantado_(fam, cfg) {
  const op = opciones_(fam, cfg);
  const dias = Number(fam.dias) || 0;
  const r = { mantener: [], subir: [] };
  const curso = mesesHastaFinCurso_(fam.fin);
  if (curso < 3) return r;
  const plazos = [3, 6].filter(n => n < curso).concat([curso]);
  const pct = n => { const t = CFG.DESCUENTOS_ADELANTADO.find(x => n >= x[0]); return t ? t[1] : 0; };
  const normal = {
    mantener: Number(cfg.tarifas[dias]) || Number(fam.tarifa) || op.mantener.precio,
    subir: op.subir ? (Number(cfg.tarifas[dias + 1]) || op.subir.precio) : 0,
  };
  ['mantener', 'subir'].forEach(plan => {
    if (!op[plan] || !op[plan].precio) return;
    const actual = Number(op[plan].precio);
    plazos.forEach(n => {
      const p = pct(n);
      const alMes = Math.min(actual, redondear_(normal[plan] * (1 - p / 100)));
      const total = redondear_(alMes * n);
      r[plan].push({ meses: n, total: total, ahorro: Math.max(0, redondear_(actual * n - total)), pct: alMes < actual ? p : 0 });
    });
  });
  return r;
}

// Meses desde el fin actual hasta el final del curso (30 de junio), al más cercano.
function mesesHastaFinCurso_(fin) {
  const anio = fin.getMonth() > CFG.FIN_CURSO.mes ? fin.getFullYear() + 1 : fin.getFullYear();
  const objetivo = new Date(anio, CFG.FIN_CURSO.mes, CFG.FIN_CURSO.dia);
  let mejor = 0;
  for (let n = 1; n <= 12; n++) {
    if (Math.abs(sumarMeses_(fin, n) - objetivo) < Math.abs(sumarMeses_(fin, mejor) - objetivo)) mejor = n;
  }
  return mejor;
}

function redondear_(n) { return Math.round(n * 100) / 100; }

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
    descuento: v(COL.DESCUENTO), motivoDescuento: String(v(COL.MOTIVO_DESCUENTO) || '').trim(),
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
// Mismo día del mes N meses después (o el último día si ese mes es más corto).
function sumarMeses_(d, n) {
  const ultimo = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), ultimo));
}
function fmt_(d) { return d ? ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear() : ''; }
function fechaLarga_(d) { return d.getDate() + ' de ' + MESES[d.getMonth()]; }
function norm_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function primerNombre_(s) { const n = String(s || '').trim().split(/\s+/)[0] || ''; return n.charAt(0).toUpperCase() + n.slice(1); }
function minus_(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
function euros_(n) { const x = Number(n); return x.toLocaleString('es-ES', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €'; }
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
