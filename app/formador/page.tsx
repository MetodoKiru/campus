"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, GraduationCap, KeyRound, LogOut, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Toast from "@/components/Toast";

interface OnboardingMentor {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  notes: string;
  createdAt: string;
  confidentialitySignedAt: string | null;
  certificateCheckedAt: string | null;
  account: { username: string | null; isActive: boolean; lastSignInAt: string | null } | null;
  students: number;
}

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString("es-ES") : "");

export default function FormadorPage() {
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [name, setName] = useState("");
  const [mentors, setMentors] = useState<OnboardingMentor[]>([]);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [newMentor, setNewMentor] = useState({ fullName: "", email: "", phone: "" });
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [issuedPin, setIssuedPin] = useState<{ fullName: string; username: string; pin: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
    const response = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Ha ocurrido un error.");
    return result;
  }, []);

  const loadMentors = useCallback(async () => {
    try {
      const result = await api("/api/formador/mentores");
      setMentors(Array.isArray(result.mentors) ? result.mentors : []);
    } catch (error) {
      setMsg({ text: error instanceof Error ? error.message : "No se pudieron cargar los mentores.", type: "error" });
    }
  }, [api]);

  useEffect(() => {
    let alive = true;
    const verifyRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/"); return; }
        const { data: profile, error } = await supabase.from("profiles").select("full_name,role,is_active").eq("id", user.id).single();
        // Administración también puede entrar para seguir la incorporación.
        const allowed = profile?.role === "formador" || profile?.role === "admin";
        if (error || !profile?.is_active || !allowed || user.app_metadata?.kiru_role !== profile.role) {
          router.replace("/");
          return;
        }
        if (!alive) return;
        setName(profile.full_name);
        setAuthorized(true);
        await loadMentors();
      } catch { router.replace("/"); }
      finally { if (alive) setAuthChecking(false); }
    };
    void verifyRole();
    return () => { alive = false; };
  }, [router, loadMentors]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try { await action(); await loadMentors(); }
    catch (error) { setMsg({ text: error instanceof Error ? error.message : "Ha ocurrido un error.", type: "error" }); }
    finally { setBusy(false); }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("/api/formador/mentores", { method: "POST", body: JSON.stringify(newMentor) });
      setNewMentor({ fullName: "", email: "", phone: "" });
      setMsg({ text: "Mentor añadido a la incorporación.", type: "success" });
    });
  };

  const toggle = (mentor: OnboardingMentor, field: "confidentiality" | "certificate") => {
    const current = field === "confidentiality" ? mentor.confidentialitySignedAt : mentor.certificateCheckedAt;
    if (current && mentor.account && !window.confirm("Este mentor ya tiene cuenta. ¿Seguro que quieres desmarcarlo?")) return;
    void run(async () => {
      await api("/api/formador/mentores", { method: "PATCH", body: JSON.stringify({ id: mentor.id, [field]: !current }) });
    });
  };

  const archive = (mentor: OnboardingMentor) => {
    if (!window.confirm(`¿Quitar a ${mentor.fullName} de la lista? La ficha se guarda archivada.`)) return;
    void run(async () => {
      await api("/api/formador/mentores", { method: "PATCH", body: JSON.stringify({ id: mentor.id, archived: true }) });
    });
  };

  const createAccount = (mentor: OnboardingMentor) => {
    void run(async () => {
      const result = await api(`/api/formador/mentores/${mentor.id}/cuenta`, { method: "POST", body: JSON.stringify({ username: usernames[mentor.id] ?? "" }) });
      setIssuedPin({ fullName: mentor.fullName, username: result.username, pin: result.pin });
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  if (authChecking) return <main className="min-h-screen bg-[#F7F6F3] flex items-center justify-center text-sm text-slate-500">Comprobando permisos…</main>;
  if (!authorized) return null;

  const pending = mentors.filter((m) => !(m.confidentialitySignedAt && m.certificateCheckedAt && m.account && m.students > 0));
  const ready = mentors.filter((m) => !pending.includes(m));

  return (
    <div className="min-h-screen bg-[#F7F6F3] text-[#343330] pb-16 font-sans">
      <header className="bg-white border-b border-[#E7E3DC] px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <GraduationCap className="w-6 h-6 text-emerald-800" />
          <div>
            <h1 className="font-serif text-xl sm:text-2xl text-[#292825] font-bold">Panel del Formador</h1>
            <p className="text-[11px] sm:text-xs text-slate-500">Hola, {name}. Incorporación de mentores nuevos</p>
          </div>
        </div>
        <button onClick={logout} title="Cerrar sesión" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Cerrar sesión</span>
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {msg && <Toast text={msg.text} type={msg.type} onClose={() => setMsg(null)} />}

        {issuedPin && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-bold flex items-center gap-2"><KeyRound className="h-4 w-4" /> Cuenta creada para {issuedPin.fullName}</p>
            <p className="mt-1">Usuario: <span className="font-mono font-bold">{issuedPin.username}</span> · PIN: <span className="font-mono font-bold">{issuedPin.pin}</span></p>
            <p className="mt-1 text-xs">Apúntalo y entrégaselo en persona o por un canal privado. Por seguridad no se vuelve a mostrar; si se pierde, administración puede poner un PIN nuevo.</p>
            <button onClick={() => setIssuedPin(null)} className="mt-2 text-xs font-semibold underline">Ya lo he apuntado</button>
          </div>
        )}

        <section className="bg-white rounded-3xl border border-[#E7E3DC] p-5 shadow-sm">
          <h2 className="font-serif text-lg font-bold text-slate-900 flex items-center gap-2"><UserPlus className="h-5 w-5" /> Añadir mentor seleccionado</h2>
          <p className="text-xs text-slate-500 mt-1">Cuando un candidato ha pasado la selección, añádelo aquí para seguir su incorporación.</p>
          <form onSubmit={handleCreate} className="mt-4 grid gap-3 sm:grid-cols-4">
            <input required placeholder="Nombre y apellidos" value={newMentor.fullName} onChange={(e) => setNewMentor({ ...newMentor, fullName: e.target.value })} className="p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs sm:col-span-1" />
            <input required type="email" placeholder="Correo" value={newMentor.email} onChange={(e) => setNewMentor({ ...newMentor, email: e.target.value })} className="p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs" />
            <input placeholder="Teléfono (opcional)" value={newMentor.phone} onChange={(e) => setNewMentor({ ...newMentor, phone: e.target.value })} className="p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs" />
            <button disabled={busy} type="submit" className="py-3 bg-slate-900 text-white text-xs font-semibold rounded-2xl hover:bg-slate-800 disabled:opacity-50">Añadir</button>
          </form>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-lg font-bold text-slate-900">Pendientes ({pending.length})</h2>
          {pending.length === 0 && <p className="text-sm text-slate-500">No hay mentores pendientes de incorporación.</p>}
          {pending.map((mentor) => (
            <MentorCard key={mentor.id} mentor={mentor} busy={busy} username={usernames[mentor.id] ?? ""}
              onUsername={(value) => setUsernames((u) => ({ ...u, [mentor.id]: value }))}
              onToggle={(field) => toggle(mentor, field)} onCreateAccount={() => createAccount(mentor)} onArchive={() => archive(mentor)} />
          ))}
        </section>

        {ready.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-bold text-slate-900">Incorporados ({ready.length})</h2>
            {ready.map((mentor) => (
              <MentorCard key={mentor.id} mentor={mentor} busy={busy} username="" onUsername={() => {}}
                onToggle={(field) => toggle(mentor, field)} onCreateAccount={() => {}} onArchive={() => archive(mentor)} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

function Step({ done, label, detail }: { done: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      {done ? <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" /> : <Circle className="h-4 w-4 text-slate-300 shrink-0" />}
      <span className={done ? "text-slate-700" : "text-slate-500"}>{label}{detail ? <span className="text-slate-400"> · {detail}</span> : null}</span>
    </li>
  );
}

function MentorCard({ mentor, busy, username, onUsername, onToggle, onCreateAccount, onArchive }: {
  mentor: OnboardingMentor;
  busy: boolean;
  username: string;
  onUsername: (value: string) => void;
  onToggle: (field: "confidentiality" | "certificate") => void;
  onCreateAccount: () => void;
  onArchive: () => void;
}) {
  const canCreateAccount = Boolean(mentor.confidentialitySignedAt && mentor.certificateCheckedAt && !mentor.account);
  return (
    <article className="bg-white rounded-3xl border border-[#E7E3DC] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900">{mentor.fullName}</p>
          <p className="text-[11px] text-slate-400">{mentor.email}{mentor.phone ? ` · ${mentor.phone}` : ""} · añadido el {formatDate(mentor.createdAt)}</p>
        </div>
        <button onClick={onArchive} disabled={busy} className="text-[11px] text-slate-400 hover:text-rose-600">Quitar de la lista</button>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        <Step done={Boolean(mentor.confidentialitySignedAt)} label="Acuerdo de confidencialidad firmado" detail={formatDate(mentor.confidentialitySignedAt)} />
        <Step done={Boolean(mentor.certificateCheckedAt)} label="Certificado de delitos sexuales comprobado" detail={formatDate(mentor.certificateCheckedAt)} />
        <Step done={Boolean(mentor.account)} label="Cuenta del campus creada" detail={mentor.account ? `@${mentor.account.username}${mentor.account.lastSignInAt ? ", ya ha entrado" : ", aún no ha entrado"}` : undefined} />
        <Step done={mentor.students > 0} label="Alumno asignado" detail={mentor.students > 0 ? `${mentor.students}` : "lo asigna administración"} />
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => onToggle("confidentiality")} className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {mentor.confidentialitySignedAt ? "Desmarcar confidencialidad" : "Marcar confidencialidad firmada"}
        </button>
        <button disabled={busy} onClick={() => onToggle("certificate")} className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {mentor.certificateCheckedAt ? "Desmarcar certificado" : "Marcar certificado comprobado"}
        </button>
      </div>
      {!mentor.certificateCheckedAt && (
        <p className="mt-2 text-[11px] text-amber-700">Sin el certificado comprobado no se le puede crear cuenta ni asignar alumno. El documento no se sube aquí: solo se marca que lo has visto.</p>
      )}

      {canCreateAccount && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <input placeholder="usuario (p. ej. laura.gomez)" value={username} onChange={(e) => onUsername(e.target.value.toLowerCase())} className="p-2.5 rounded-xl border border-slate-200 bg-[#F7F6F3] text-xs font-mono" />
          <button disabled={busy || !username} onClick={onCreateAccount} className="rounded-xl bg-emerald-800 px-3 py-2.5 text-[11px] font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">Crear cuenta de mentor</button>
        </div>
      )}
    </article>
  );
}
