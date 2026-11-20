// Pruebas del alta automática de familias (lib/server/family-intake.ts).
// Se ejecutan con: npm test   (Node ≥ 23 lee TypeScript sin compilar)
import { test } from "node:test";
import assert from "node:assert/strict";
import { runFamilyIntake } from "../lib/server/family-intake.ts";
import { fakeCampus } from "./helpers/fake-campus.mjs";

const base = (over = {}) => ({
  submissionId: "6400001",
  studentName: "Ana Pérez López",
  guardians: [
    { fullName: "Pepe Pérez", email: "pepe@x.com", relationship: "Padre" },
    { fullName: "Marta López", email: "marta@x.com", relationship: "Madre" },
  ],
  studentDecision: null,
  resendTo: [],
  resendStudent: false,
  ...over,
});

test("alta completa: alumno y dos tutores, cada uno con su enlace y enlazados", async () => {
  const c = fakeCampus();
  const r = await runFamilyIntake(c.store, base());
  assert.equal(r.kind, "ok");
  assert.equal(r.student.status, "created");
  assert.ok(r.student.accessUrl);
  assert.deepEqual(r.guardians.map((g) => g.status), ["created", "created"]);
  assert.notEqual(r.guardians[0].accessUrl, r.guardians[1].accessUrl);
  assert.equal(c.guardians.size, 2, "un alumno puede tener dos tutores");
});

test("caso 1: reenviar a un tutor no invalida el enlace que ya recibió el otro", async () => {
  const c = fakeCampus();
  const first = await runFamilyIntake(c.store, base());
  const [pepe, marta] = first.guardians;
  // A Pepe le llegó el correo; el de Marta falló en Gmail. Se reintenta solo el de Marta.
  const retry = await runFamilyIntake(c.store, base({ resendTo: ["marta@x.com"] }));
  assert.equal(retry.kind, "ok");
  assert.equal(retry.guardians[0].status, "already");
  assert.equal(retry.guardians[0].accessUrl, undefined, "a Pepe no se le genera nada");
  assert.equal(retry.guardians[1].status, "resent");
  assert.ok(c.linkValid(pepe.accessUrl), "el enlace que Pepe ya tiene sigue valiendo");
  assert.ok(!c.linkValid(marta.accessUrl), "el enlace perdido de Marta deja de valer");
  assert.ok(c.linkValid(retry.guardians[1].accessUrl));
  assert.ok(c.linkValid(first.student.accessUrl), "el enlace del alumno tampoco se toca");
  assert.equal(retry.student.accessUrl, undefined);
});

test("caso 1: no se reenvía a quien ya ha entrado, aunque se pida", async () => {
  const c = fakeCampus();
  const first = await runFamilyIntake(c.store, base());
  c.accounts.get([...c.accounts.values()].find((a) => a.email === "marta@x.com").id).signedIn = true;
  const retry = await runFamilyIntake(c.store, base({ resendTo: ["marta@x.com"] }));
  assert.equal(retry.guardians[1].status, "already");
  assert.equal(retry.guardians[1].hasSignedIn, true);
  assert.equal(retry.guardians[1].accessUrl, undefined);
  assert.ok(c.linkValid(first.guardians[0].accessUrl));
});

test("repetir la misma llamada no duplica ni manda accesos", async () => {
  const c = fakeCampus();
  await runFamilyIntake(c.store, base());
  const before = c.accounts.size;
  const again = await runFamilyIntake(c.store, base());
  assert.equal(c.accounts.size, before);
  assert.equal(again.student.status, "already");
  assert.deepEqual(again.guardians.map((g) => [g.status, g.accessUrl]), [["already", undefined], ["already", undefined]]);
});

test("caso 2: un alumno con el mismo nombre deja el alta en revisión y no crea nada", async () => {
  const c = fakeCampus();
  await runFamilyIntake(c.store, base({ submissionId: "1", guardians: [{ fullName: "Otro Padre", email: "otro@x.com", relationship: null }] }));
  const before = c.accounts.size;
  const r = await runFamilyIntake(c.store, base({ submissionId: "2", studentName: "ana  PEREZ lópez" }));
  assert.equal(r.kind, "review");
  assert.equal(r.candidates.length, 1);
  assert.equal(c.accounts.size, before, "ni alumno ni tutores");
  assert.equal(c.intakes.has("2"), false);
});

test("caso 2: también en revisión si el tutor ya tiene un hijo con ese nombre (nunca se reutiliza solo)", async () => {
  const c = fakeCampus();
  await runFamilyIntake(c.store, base({ submissionId: "1" }));
  const r = await runFamilyIntake(c.store, base({ submissionId: "2" }));
  assert.equal(r.kind, "review");
});

test("caso 2: Sofía decide que es otro niño → alumno nuevo", async () => {
  const c = fakeCampus();
  const first = await runFamilyIntake(c.store, base({ submissionId: "1", guardians: [{ fullName: "Otro", email: "otro@x.com", relationship: null }] }));
  const r = await runFamilyIntake(c.store, base({ submissionId: "2", studentDecision: { kind: "new" } }));
  assert.equal(r.kind, "ok");
  assert.equal(r.student.status, "created");
  assert.notEqual(r.student.id, first.student.id);
});

test("caso 2: Sofía decide que es el mismo → se enlaza a ese alumno sin enlace nuevo para él", async () => {
  const c = fakeCampus();
  const first = await runFamilyIntake(c.store, base({ submissionId: "1", guardians: [{ fullName: "Pepe Pérez", email: "pepe@x.com", relationship: null }] }));
  const r = await runFamilyIntake(c.store, base({ submissionId: "2", studentDecision: { kind: "existing", studentId: first.student.id } }));
  assert.equal(r.kind, "ok");
  assert.equal(r.student.id, first.student.id);
  assert.equal(r.student.status, "already");
  assert.equal(r.student.accessUrl, undefined);
  assert.deepEqual(r.guardians.map((g) => g.status), ["already", "created"]);
  assert.ok(c.linkValid(first.guardians[0].accessUrl));
});

test("caso 2: un id elegido que no es de un alumno se rechaza", async () => {
  const c = fakeCampus();
  await runFamilyIntake(c.store, base({ submissionId: "1" }));
  const tutor = [...c.accounts.values()].find((a) => a.role === "padre");
  const r = await runFamilyIntake(c.store, base({ submissionId: "2", studentDecision: { kind: "existing", studentId: tutor.id } }));
  assert.equal(r.kind, "failed");
});

test("caso 3: alta parcial: se crean alumno y tutor 1; el tutor 2 llega después sin repetir nada", async () => {
  const c = fakeCampus();
  const one = base({ guardians: [base().guardians[0]] });
  const r1 = await runFamilyIntake(c.store, one);
  assert.equal(r1.student.status, "created");
  assert.deepEqual(r1.guardians.map((g) => g.status), ["created"]);
  // Sofía escribe el correo de Marta en la hoja: misma respuesta, ahora con los dos.
  const r2 = await runFamilyIntake(c.store, base());
  assert.equal(r2.student.status, "already");
  assert.equal(r2.student.accessUrl, undefined);
  assert.deepEqual(r2.guardians.map((g) => [g.status, !!g.accessUrl]), [["already", false], ["created", true]]);
  assert.ok(c.linkValid(r1.guardians[0].accessUrl), "el acceso de Pepe sigue valiendo");
  assert.ok(c.linkValid(r1.student.accessUrl), "y el del alumno también");
  assert.equal(c.guardians.size, 2);
});

test("hermano: un tutor que ya tiene cuenta se enlaza al nuevo alumno sin enlace nuevo", async () => {
  const c = fakeCampus();
  const first = await runFamilyIntake(c.store, base({ submissionId: "1", guardians: [base().guardians[0]] }));
  const r = await runFamilyIntake(c.store, base({ submissionId: "2", studentName: "Luis Pérez López", guardians: [base().guardians[0]] }));
  assert.equal(r.student.status, "created");
  assert.equal(r.guardians[0].status, "linked");
  assert.equal(r.guardians[0].accessUrl, undefined);
  assert.ok(c.linkValid(first.guardians[0].accessUrl));
});

test("un correo de mentor no se toca y no bloquea al otro tutor", async () => {
  const c = fakeCampus();
  const id = await c.store.createAccount("mentor", "Mentora", "marta@x.com");
  c.accounts.get(id).role = "mentor";
  const r = await runFamilyIntake(c.store, base());
  assert.deepEqual(r.guardians.map((g) => g.status), ["created", "error"]);
  assert.match(r.guardians[1].error, /mentor/);
  assert.equal(c.guardians.size, 1);
});
