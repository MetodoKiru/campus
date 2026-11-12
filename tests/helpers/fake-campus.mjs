// Campus en memoria compartido con las pruebas del Apps Script.
import { normalizeName } from "../../lib/server/family-intake.ts";

/** Campus en memoria: cuentas, enlaces válidos por cuenta, vínculos y altas. */
export function fakeCampus() {
  let n = 0;
  const accounts = new Map(); // id → { id, fullName, username, role, isActive, email, signedIn }
  const links = new Map(); // profileId → token válido (uno por cuenta)
  const guardians = new Set(); // "alumno|tutor"
  const intakes = new Map();
  const issued = new Map(); // profileId → cuántos enlaces se han generado
  const store = {
    async findAccountIdByEmail(email) { return [...accounts.values()].find((a) => a.email === email)?.id ?? null; },
    async getProfile(id) { return accounts.get(id) ?? null; },
    async hasSignedIn(id) { return !!accounts.get(id)?.signedIn; },
    async createAccount(role, fullName, email) {
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      accounts.set(id, { id, fullName, username: `${role}.${n}`, role, isActive: true, email, signedIn: false });
      return id;
    },
    async deleteAccount(id) { accounts.delete(id); },
    async getIntake(s) { return intakes.get(s) ?? null; },
    async saveIntake(s, id) { if (intakes.has(s)) return "conflict"; intakes.set(s, id); return "ok"; },
    async findStudentsNamed(name) { return [...accounts.values()].filter((a) => a.role === "alumno" && normalizeName(a.fullName) === normalizeName(name)); },
    async guardianIdsOf(sid) { return [...guardians].filter((k) => k.startsWith(sid + "|")).map((k) => k.split("|")[1]); },
    async linkGuardian(sid, gid) { guardians.add(sid + "|" + gid); return true; },
    async issueLink(pid) {
      const token = `t-${++n}`;
      links.set(pid, token); // como issueAccessLink: solo sustituye el enlace de ESA cuenta
      issued.set(pid, (issued.get(pid) ?? 0) + 1);
      return { accessUrl: `https://campus/acceso#t=${token}`, expiresAt: "2026-11-23T00:00:00Z" };
    },
  };
  const linkValid = (url) => [...links.values()].some((t) => url.endsWith("#t=" + t));
  return { store, accounts, guardians, intakes, issued, linkValid };
}

