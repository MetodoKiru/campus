// Hilo aparte con el campus en memoria y la lógica real del alta, para que el
// Apps Script (que es síncrono) pueda llamarlo como si fuera UrlFetchApp.
import { workerData } from "node:worker_threads";
import { runFamilyIntake } from "../../lib/server/family-intake.ts";
import { fakeCampus } from "./fake-campus.mjs";

const { port, flag } = workerData;
const signal = new Int32Array(flag);
const c = fakeCampus();

port.on("message", async (msg) => {
  let reply;
  try {
    if (msg.op === "alta") {
      const b = msg.body;
      const r = await runFamilyIntake(c.store, {
        submissionId: b.submissionId,
        studentName: b.student.fullName,
        guardians: b.guardians,
        studentDecision: b.studentId ? { kind: "existing", studentId: b.studentId } : b.newStudent ? { kind: "new" } : null,
        resendTo: b.resendTo || [],
        resendStudent: b.resendStudent === true,
      });
      reply = r.kind === "failed" ? { code: r.status, body: { error: r.error } }
        : r.kind === "review" ? { code: 200, body: { ok: true, review: true, reason: r.reason, candidates: r.candidates } }
        : { code: 200, body: { ok: true, loginUrl: "https://campus/", student: r.student, guardians: r.guardians } };
    } else if (msg.op === "crearAlumno") {
      reply = { id: await c.store.createAccount("alumno", msg.name, null) };
    } else if (msg.op === "entrar") {
      // Simula que esa cuenta ya ha entrado (ha puesto su PIN).
      for (const a of c.accounts.values()) if (a.email === msg.email || (msg.alumno && a.role === "alumno")) a.signedIn = true;
      reply = {};
    } else if (msg.op === "estado") {
      reply = {
        cuentas: [...c.accounts.values()].map((a) => ({ role: a.role, email: a.email, fullName: a.fullName })),
        vinculos: c.guardians.size,
        validos: (msg.urls || []).map((u) => c.linkValid(u)),
        enlacesAlumno: [...c.accounts.values()].filter((a) => a.role === "alumno").reduce((n, a) => n + (c.issued.get(a.id) ?? 0), 0),
        enlacesTotal: [...c.issued.values()].reduce((n, x) => n + x, 0),
      };
    }
  } catch (e) {
    reply = { code: 500, body: { error: String(e) } };
  }
  port.postMessage(reply);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
});
