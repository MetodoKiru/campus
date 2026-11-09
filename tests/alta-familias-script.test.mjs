// Pruebas del Apps Script docs/apps-script/alta-familias.gs con una hoja, un
// Gmail y unas Propiedades falsos, contra la lógica real del alta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { MessageChannel, Worker, receiveMessageOnPort } from "node:worker_threads";

const CAB = [
  "Submission Date", "Nombre y apellidos del alumno - First Name", "Nombre y apellidos del alumno - Last Name",
  "Nombre y apellidos del progenitor/tutor 1", "Relación con el alumno del progenitor/tutor 1", "Teléfono del progenitor/tutor 1", "Correo electrónico del progenitor/tutor 1",
  "Nombre y apellidos del progenitor/tutor 2", "Relación con el alumno del progenitor/tutor 2", "Teléfono del progenitor/tutor 2", "Correo electrónico del progenitor/tutor 2",
  "Autorización para crear una cuenta en la Plataforma Kiru", "Submission ID",
];
const fila = (o = {}) => [
  "2026-11-09", o.nombre ?? "Ana", o.apellidos ?? "Pérez López",
  o.t1 ?? "Pepe Pérez", "Padre", "629797635", o.c1 ?? "pepe@x.com",
  o.t2 ?? "Marta López", "Madre", "611223344", o.c2 ?? "marta@x.com",
  o.autoriza ?? "Sí, autorizo", o.envio ?? "6400001",
];

function entorno(filas) {
  // Campus en otro hilo, llamado de forma síncrona.
  const flag = new SharedArrayBuffer(4);
  const signal = new Int32Array(flag);
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(new URL("./helpers/campus-worker.mjs", import.meta.url), { workerData: { port: port2, flag }, transferList: [port2] });
  const campus = (msg) => {
    Atomics.store(signal, 0, 0);
    port1.postMessage(msg);
    Atomics.wait(signal, 0, 0, 10000);
    return receiveMessageOnPort(port1).message;
  };

  const datos = [CAB.slice(), ...filas.map((f) => f.slice())];
  const ancho = () => Math.max(...datos.map((f) => f.length));
  const celda = (r, c) => ({
    setValue(v) { while (datos[r].length <= c) datos[r].push(""); datos[r][c] = v; return this; },
    setFontWeight() { return this; },
  });
  const hoja = {
    getLastRow: () => datos.length,
    getLastColumn: () => ancho(),
    getRange: (r, c, nr = 1, nc = 1) => Object.assign(celda(r - 1, c - 1), {
      getValues: () => datos.slice(r - 1, r - 1 + nr).map((f) => Array.from({ length: nc }, (_, i) => f[c - 1 + i] ?? "")),
    }),
    getDataRange: () => ({ getValues: () => datos.map((f) => Array.from({ length: ancho() }, (_, i) => f[i] ?? "")) }),
  };
  const props = new Map([["KIRU_ALTA_SECRET", "x".repeat(32)]]);
  const correos = [];
  let gmailFallaPara = new Set();
  const llamadas = [];
  const ctx = {
    console: { error() {}, log() {} },
    kiruEscapar: (s) => String(s),
    KIRU_REMITENTE: "Método Kiru",
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => hoja, getSheets: () => [hoja] }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, String(v)), deleteProperty: (k) => props.delete(k),
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: () => "09/11/2026 16:00", computeDigest: () => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], DigestAlgorithm: {} },
    GmailApp: { sendEmail(to, asunto, texto, opts) {
      if (gmailFallaPara.has(to)) throw new Error("Service invoked too many times");
      correos.push({ to, asunto, texto, html: opts.htmlBody });
    } },
    UrlFetchApp: { fetch(url, o) {
      const body = JSON.parse(o.payload);
      llamadas.push(body);
      const r = campus({ op: "alta", body });
      return { getResponseCode: () => r.code, getContentText: () => JSON.stringify(r.body) };
    } },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../docs/apps-script/alta-familias.gs", import.meta.url), "utf8"), ctx);
  const col = (nombre) => datos[0].indexOf(nombre);
  return {
    pasada: () => { correos.length = 0; llamadas.length = 0; ctx.altaFamiliasRevisar_(); return correos.slice(); },
    estado: (r = 1) => String(datos[r][col("CAMPUS ALTA")] ?? ""),
    escribir: (r, nombre, v) => { const c = col(nombre); while (datos[r].length <= c) datos[r].push(""); datos[r][c] = v; },
    escribirCampo: (r, i, v) => { datos[r][i] = v; },
    anadirFila: (f) => { datos.push(f.slice()); },
    enlaces: (texto) => [...texto.matchAll(/https:\/\/campus\/acceso#t=t-\d+/g)].map((m) => m[0]),
    campus,
    llamadas,
    falla: (correosQueFallan) => { gmailFallaPara = new Set(correosQueFallan); },
    cerrar: () => worker.terminate(),
  };
}

const aTutor = (correos, to) => correos.filter((c) => c.to === to);
const resumen = (correos) => correos.find((c) => c.to === "metodokiru@gmail.com");


const enlaceAlumno = (m) => (m.texto.match(/elegid su PIN de 6 números: (https:\/\/campus\/acceso#t=t-\d+)/) || [])[1];
const sinReenvios = (e) => e.llamadas.every((b) => b.resendTo.length === 0 && b.resendStudent === false);

test("los dos tutores reciben exactamente el mismo enlace del alumno, generado una sola vez", () => {
  const e = entorno([fila()]);
  try {
    const c = e.pasada();
    const [pepe] = aTutor(c, "pepe@x.com");
    const [marta] = aTutor(c, "marta@x.com");
    assert.ok(enlaceAlumno(pepe));
    assert.equal(enlaceAlumno(pepe), enlaceAlumno(marta), "el mismo enlace en los dos correos");
    assert.match(pepe.texto, /Este mismo botón lo ha recibido también Marta López/);
    assert.match(marta.texto, /Es una sola cuenta con un solo PIN: basta con usar el botón una vez/);
    const st = e.campus({ op: "estado", urls: [enlaceAlumno(pepe)] });
    assert.equal(st.enlacesAlumno, 1, "un solo enlace del alumno");
    assert.deepEqual(st.validos, [true]);
    assert.equal(st.cuentas.filter((a) => a.role === "alumno").length, 1, "una sola cuenta de alumno");
    assert.match(e.estado(), /^ACCESO ENVIADO/);
    assert.equal(e.pasada().length, 0, "repetir la pasada no manda nada");
  } finally { e.cerrar(); }
});

test("caso 1: Gmail falla con un tutor → el reintento reutiliza los mismos enlaces; no se genera ninguno", () => {
  const e = entorno([fila()]);
  try {
    e.falla(["marta@x.com"]);
    let c = e.pasada();
    assert.match(e.estado(), /^CUENTAS CREADAS · reintentando el correo a marta@x\.com \(intento 1 de 3\)/);
    const [pepe] = aTutor(c, "pepe@x.com");
    assert.match(resumen(c).html, /el correo no ha salido/);
    const antes = e.campus({ op: "estado" });

    e.falla([]);
    c = e.pasada();
    assert.ok(sinReenvios(e), "no se pide ningún enlace nuevo al campus");
    assert.equal(aTutor(c, "pepe@x.com").length, 0, "a Pepe no se le vuelve a escribir");
    const [marta] = aTutor(c, "marta@x.com");
    assert.match(marta.asunto, /Tu acceso/);
    assert.equal(enlaceAlumno(marta), enlaceAlumno(pepe), "Marta recibe el mismo enlace del alumno que Pepe");
    const despues = e.campus({ op: "estado", urls: [...e.enlaces(pepe.texto), ...e.enlaces(marta.texto)] });
    assert.equal(despues.enlacesTotal, antes.enlacesTotal, "ningún enlace nuevo");
    assert.ok(despues.validos.every(Boolean), "todos los enlaces enviados siguen valiendo");
    assert.match(e.estado(), /^ACCESO ENVIADO/);
    assert.equal(e.pasada().length, 0, "una familia terminada no vuelve a recibir nada");
  } finally { e.cerrar(); }
});

test("caso 1: Gmail falla con los dos → el reintento manda a ambos los enlaces originales", () => {
  const e = entorno([fila()]);
  try {
    e.falla(["pepe@x.com", "marta@x.com"]);
    e.pasada();
    const antes = e.campus({ op: "estado" });
    e.falla([]);
    const c = e.pasada();
    assert.ok(sinReenvios(e));
    const [pepe] = aTutor(c, "pepe@x.com");
    const [marta] = aTutor(c, "marta@x.com");
    assert.equal(enlaceAlumno(pepe), enlaceAlumno(marta));
    const st = e.campus({ op: "estado", urls: [...e.enlaces(pepe.texto), ...e.enlaces(marta.texto)] });
    assert.equal(st.enlacesTotal, antes.enlacesTotal);
    assert.equal(st.enlacesAlumno, 1);
    assert.ok(st.validos.every(Boolean));
  } finally { e.cerrar(); }
});
test("caso 1: si Gmail sigue fallando, tras 3 intentos se para y se pide REENVIAR", () => {
  const e = entorno([fila()]);
  try {
    e.falla(["marta@x.com"]);
    e.pasada(); e.pasada();
    const c = e.pasada();
    assert.match(e.estado(), /^CUENTAS CREADAS · no se ha podido enviar a marta@x\.com: revisa el correo y escribe REENVIAR/);
    assert.ok(resumen(c), "se avisa a Sofía del fallo definitivo");
    assert.equal(e.pasada().length, 0, "y ya no se insiste solo");
  } finally { e.cerrar(); }
});


test("caso 1: un solo tutor y falla Gmail → el reintento le manda los mismos enlaces", () => {
  const e = entorno([fila({ t2: "", c2: "" })]);
  try {
    e.falla(["pepe@x.com"]);
    e.pasada();
    const antes = e.campus({ op: "estado" });
    e.falla([]);
    const c = e.pasada();
    assert.ok(sinReenvios(e));
    const [pepe] = aTutor(c, "pepe@x.com");
    assert.equal(e.enlaces(pepe.texto).length, 2, "su acceso y el del alumno");
    assert.equal(e.campus({ op: "estado" }).enlacesTotal, antes.enlacesTotal);
  } finally { e.cerrar(); }
});

test("un tutor que ya tenía cuenta recibe un único correo (aviso + acceso del alumno) y el otro su bienvenida", () => {
  const e = entorno([fila({ envio: "1", nombre: "Luis", t2: "", c2: "" })]);
  try {
    e.pasada(); // Pepe da de alta a su primer hijo, Luis
    e.campus({ op: "entrar", email: "pepe@x.com" }); // y ya usa el campus
    e.anadirFila(fila({ envio: "2" })); // llega el formulario de Ana, con Pepe y Marta
    let c = e.pasada();
    const dePepe = aTutor(c, "pepe@x.com");
    assert.equal(dePepe.length, 1, "un solo correo a Pepe");
    assert.match(dePepe[0].asunto, /Ana ya está en tu cuenta/);
    assert.equal(e.enlaces(dePepe[0].texto).length, 1, "sin acceso propio nuevo, solo el del alumno");
    const [marta] = aTutor(c, "marta@x.com");
    assert.match(marta.asunto, /Tu acceso/);
    assert.equal(enlaceAlumno(dePepe[0]), enlaceAlumno(marta), "el mismo enlace del alumno");
    c = e.pasada();
    assert.equal(c.length, 0, "nada repetido");
  } finally { e.cerrar(); }
});

test("caso 2: mismo nombre que un alumno del campus → REVISIÓN MANUAL sin crear nada", () => {
  const e = entorno([fila()]);
  try {
    const { id } = e.campus({ op: "crearAlumno", name: "Ana Pérez López" });
    const c = e.pasada();
    assert.match(e.estado(), /^REVISIÓN MANUAL · ya hay un alumno con ese nombre/);
    assert.ok(e.estado().includes(id));
    assert.equal(aTutor(c, "pepe@x.com").length + aTutor(c, "marta@x.com").length, 0, "no se escribe a la familia");
    assert.match(resumen(c).html, /Revisión manual/);
    const cuentas = e.campus({ op: "estado" }).cuentas;
    assert.equal(cuentas.length, 1, "solo existe el alumno que ya había");
    assert.equal(e.pasada().length, 0, "sin decisión, no se repite el aviso");

    // Sofía decide que es otro niño.
    e.escribir(1, "CAMPUS ID ALUMNO", "NUEVO");
    const c2 = e.pasada();
    assert.match(e.estado(), /^ACCESO ENVIADO/);
    assert.equal(aTutor(c2, "pepe@x.com").length, 1);
    assert.equal(e.campus({ op: "estado" }).cuentas.filter((a) => a.role === "alumno").length, 2);
  } finally { e.cerrar(); }
});

test("caso 2: Sofía indica que es el mismo alumno → se enlaza a ese, sin crear otro", () => {
  const e = entorno([fila()]);
  try {
    const { id } = e.campus({ op: "crearAlumno", name: "Ana Pérez López" });
    e.pasada();
    e.escribir(1, "CAMPUS ID ALUMNO", id);
    e.pasada();
    assert.match(e.estado(), /^ACCESO ENVIADO/);
    const st = e.campus({ op: "estado" });
    assert.equal(st.cuentas.filter((a) => a.role === "alumno").length, 1);
    assert.equal(st.vinculos, 2);
  } finally { e.cerrar(); }
});


test("caso 3: tutor 2 sin correo → alta de alumno y tutor 1; al llegar su correo, recibe el MISMO enlace del alumno", () => {
  const e = entorno([fila({ c2: "" })]);
  try {
    let c = e.pasada();
    assert.equal(e.estado(), "ALTA PARCIAL · acceso enviado a pepe@x.com · PENDIENTE correo de Marta López");
    const [pepe] = aTutor(c, "pepe@x.com");
    const r = resumen(c);
    assert.match(r.html, /Alta parcial/);
    assert.match(r.html, /Marta López — <strong>pendiente<\/strong>/);
    assert.match(r.html, /wa\.me\/34611223344\?text=/);
    assert.equal(e.campus({ op: "estado" }).cuentas.length, 2, "alumno y Pepe");
    assert.equal(e.pasada().length, 0, "mientras no cambie la fila, no se repite el aviso");

    e.escribirCampo(1, CAB.indexOf("Correo electrónico del progenitor/tutor 2"), "marta@x.com");
    c = e.pasada();
    assert.ok(sinReenvios(e));
    assert.equal(aTutor(c, "pepe@x.com").length, 0, "a Pepe no se le reenvía nada");
    const [marta] = aTutor(c, "marta@x.com");
    assert.equal(enlaceAlumno(marta), enlaceAlumno(pepe), "el mismo enlace del alumno, que sigue sin usarse");
    const st = e.campus({ op: "estado", urls: [enlaceAlumno(pepe)] });
    assert.equal(st.enlacesAlumno, 1);
    assert.deepEqual(st.validos, [true]);
    assert.match(e.estado(), /^ACCESO ENVIADO/);
    assert.equal(st.vinculos, 2);
  } finally { e.cerrar(); }
});

test("caso 3: si el alumno ya puso su PIN, el tutor que llega después no recibe enlace del alumno", () => {
  const e = entorno([fila({ c2: "" })]);
  try {
    e.pasada();
    e.campus({ op: "entrar", alumno: true });
    e.escribirCampo(1, CAB.indexOf("Correo electrónico del progenitor/tutor 2"), "marta@x.com");
    const c = e.pasada();
    assert.ok(sinReenvios(e));
    const [marta] = aTutor(c, "marta@x.com");
    assert.equal(enlaceAlumno(marta), undefined);
    assert.equal(e.enlaces(marta.texto).length, 1, "solo su propio acceso");
    assert.equal(e.campus({ op: "estado" }).enlacesAlumno, 1);
  } finally { e.cerrar(); }
});

test("REENVIAR (a mano): enlaces nuevos para quien no ha entrado, y el del alumno igual para los dos", () => {
  const e = entorno([fila()]);
  try {
    e.pasada();
    e.escribir(1, "CAMPUS ALTA", "REENVIAR");
    const c = e.pasada();
    const [pepe] = aTutor(c, "pepe@x.com");
    const [marta] = aTutor(c, "marta@x.com");
    assert.equal(enlaceAlumno(pepe), enlaceAlumno(marta));
    assert.match(pepe.texto, /Si recibiste uno anterior, ya no vale/);
    assert.equal(e.campus({ op: "estado" }).enlacesAlumno, 2);
    assert.match(e.estado(), /^ACCESO ENVIADO/);
    assert.equal(e.pasada().length, 0);
  } finally { e.cerrar(); }
});

test("falta un dato obligatorio → PENDIENTE sin crear nada; sin autorización → nada", () => {
  const e = entorno([fila({ nombre: "", apellidos: "" }), fila({ envio: "2", autoriza: "" })]);
  try {
    const c = e.pasada();
    assert.equal(e.estado(1), "PENDIENTE · falta el nombre del alumno");
    assert.match(e.estado(2), /^SIN AUTORIZACIÓN/);
    assert.equal(c.length, 1, "solo el resumen a Sofía");
    assert.equal(e.campus({ op: "estado" }).cuentas.length, 0);
  } finally { e.cerrar(); }
});

test("tutor 2 duplicado: se ignora solo si es claramente el mismo", () => {
  const e = entorno([fila({ t2: "PEPE  pérez", c2: "" }), fila({ envio: "2", nombre: "Luis", t2: "Pepe Pérez", c2: "otro@x.com" })]);
  try {
    e.pasada();
    assert.match(e.estado(1), /^ACCESO ENVIADO/, "mismo nombre y sin correo: es el mismo, no queda nada pendiente");
    assert.ok(e.campus({ op: "estado" }).cuentas.some((a) => a.email === "otro@x.com"), "mismo nombre pero otro correo: cuenta como tutor");
  } finally { e.cerrar(); }
});
