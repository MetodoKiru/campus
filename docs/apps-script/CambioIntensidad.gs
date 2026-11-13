/*******************************************************
 * MÉTODO KIRU · CAMBIO DE INTENSIDAD (con el campus)
 * Va dentro de la hoja «Contabilidad 26-27», en el mismo proyecto que
 * Código.gs (renovaciones). Archivo nuevo: no cambia nada de lo que ya hay.
 *
 * Qué hace: cuando una familia sube o baja de días en la renovación, elige el
 * nuevo horario en el campus, su mentor lo confirma y el campus lo aplica el
 * día que empieza la nueva mensualidad. Entonces, en la pestaña «Familias»:
 *   - «Días/semana» (columna E) pasa al número nuevo,
 *   - «Precio que paga (€)» (columna G) pasa al precio del plan elegido,
 *   - en «Notas» (columna M) se añade una línea con el cambio y el horario.
 * Y te llega un correo a «Email avisos» con lo que ha cambiado.
 *
 * Se llama sola desde sincronizarRenovacionesCampus() (cada 10 minutos), con
 * la línea «sincronizarHorariosCampus_(sh, datos, cfg);» al final. Necesita
 * la propiedad KIRU_ALTA_SECRET (la misma de siempre).
 *******************************************************/

function sincronizarHorariosCampus_(sh, datos, cfg) {
  const r = campus_({ accion: 'horarios' });
  if (!r || !Array.isArray(r.cambios) || !r.cambios.length) return;
  const hechos = [];
  const avisos = [];
  r.cambios.forEach(c => {
    for (let i = 1; i < datos.length; i++) {
      const fam = leerFamilia_(datos[i]);
      if (norm_(fam.alumno) !== norm_(c.alumno)) continue;
      if (c.email && norm_(fam.email) !== norm_(c.email)) continue;
      const fila = i + 1;
      const antes = (fam.dias || '?') + ' días · ' + euros_(Number(fam.paga) || 0);
      sh.getRange(fila, COL.DIAS).setValue(Number(c.dias));
      if (c.precio !== null && c.precio !== '' && !isNaN(Number(c.precio))) sh.getRange(fila, COL.PAGA).setValue(Number(c.precio));
      const linea = 'CAMBIO DE INTENSIDAD (' + fmt_(hoy_()) + '): desde el ' + fmtIso_(c.desde) + ' pasa a ' + c.dias
        + (Number(c.dias) === 1 ? ' día' : ' días') + ' por semana'
        + (c.precio !== null && c.precio !== '' ? ', ' + euros_(Number(c.precio)) + '/mes' : '')
        + (c.horario ? '. Horario: ' + c.horario : '') + '. Antes: ' + antes + '. (Lo apuntó el campus.)';
      const notas = String(sh.getRange(fila, COL.NOTAS).getValue() || '');
      sh.getRange(fila, COL.NOTAS).setValue(notas ? notas + '\n' + linea : linea);
      avisos.push('- ' + fam.alumno + ': ' + linea);
      hechos.push(c.id);
      break;
    }
  });
  if (hechos.length) {
    campus_({ accion: 'horarios_ok', ids: hechos });
    MailApp.sendEmail(cfg.emailAvisos, 'Kiru · Cambio de horario aplicado',
      'El campus ha aplicado estos cambios de intensidad y los he apuntado en «Familias» (días, precio y notas):\n\n'
      + avisos.join('\n') + '\n\nSi algún precio no es el correcto (por ejemplo, por un descuento), cámbialo a mano en «Precio que paga».');
  }
  const sinFila = r.cambios.filter(c => hechos.indexOf(c.id) < 0);
  if (sinFila.length) console.log('Cambios de horario sin fila en «Familias»: ' + sinFila.map(c => c.alumno).join(', '));
}

function fmtIso_(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso || '');
}
