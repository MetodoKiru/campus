"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Compass, LogOut, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Toast from "@/components/Toast";
import OffersPanel from "@/components/offers/OffersPanel";
import { daysSince, findAnswer, isLate, parseAnswers, type SessionAnswer } from "@/lib/session-logs";

interface Person { id: string; full_name: string; username: string | null; role: string }
interface SessionLog {
  id: string;
  submittedAt: string;
  sessionDate: string | null;
  mentorName: string;
  studentName: string;
  mentorId: string | null;
  studentId: string | null;
  incident: string;
  answers: SessionAnswer[];
}
interface Review { note: string; reviewedBy: string | null; reviewedAt: string }
interface ActivityRow { owner_id: string; record_type: string; created_by: string | null; updated_at: string }

// Sin plan de sesiones todavía, «al día» significa al menos un registro en los últimos 8 días.
const STALE_DAYS = 8;
const WINDOW_DAYS = 30;

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "—";

function ago(value: string | null | undefined): string {
  const days = daysSince(value);
  if (days === null) return "nunca";
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

export default function CoordinadorPage() {
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);
  const [me, setMe] = useState<{ id: string; name: string; isAdmin: boolean } | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [coordinatorOf, setCoordinatorOf] = useState<Record<string, string>>({});
  const [mentorOf, setMentorOf] = useState<Record<string, string>>({});
  const [guardians, setGuardians] = useState<{ student_id: string; guardian_id: string }[]>([]);
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [lastSignIn, setLastSignIn] = useState<Record<string, string | null>>({});
  const [tab, setTab] = useState<"mentores" | "incidencias" | "registros" | "sin-asignar" | "propuestas">("mentores");
  const [selectedMentor, setSelectedMentor] = useState<string | null>(null);
  const [coordinatorFilter, setCoordinatorFilter] = useState("todos");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const notifyOffers = useCallback((text: string, type: "success" | "error") => setMsg({ text, type }), []);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
    const [profiles, links, assignments, families, logRows, reviewRows, access] = await Promise.all([
      supabase.from("profiles").select("id,full_name,username,role"),
      supabase.from("kiru_coordinator_mentors").select("mentor_id,coordinator_id"),
      supabase.from("student_mentors").select("student_id,mentor_id"),
      supabase.from("student_guardians").select("student_id,guardian_id"),
      supabase.from("kiru_session_logs")
        .select("id,submitted_at,session_date,mentor_name,student_name,mentor_id,student_id,incident,answers")
        .order("session_date", { ascending: false, nullsFirst: false })
        .limit(2000),
      supabase.from("kiru_incident_reviews").select("log_id,note,reviewed_by,reviewed_at"),
      fetch("/api/coordinador/accesos", { cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } })
        .then(async (r) => (r.ok ? ((await r.json()).lastSignIn ?? {}) : {}))
        .catch(() => ({})),
    ]);
    const failed = [profiles, links, assignments, families, logRows, reviewRows].find((r) => r.error);
    if (failed?.error) throw new Error(`No se pudieron cargar los datos: ${failed.error.message}`);

    const assignmentRows = assignments.data ?? [];
    setPeople(profiles.data ?? []);
    setCoordinatorOf(Object.fromEntries((links.data ?? []).map((l) => [l.mentor_id, l.coordinator_id])));
    setMentorOf(Object.fromEntries(assignmentRows.map((a) => [a.student_id, a.mentor_id])));
    setGuardians(families.data ?? []);
    setLogs((logRows.data ?? []).map((l) => ({
      id: l.id, submittedAt: l.submitted_at, sessionDate: l.session_date, mentorName: l.mentor_name, studentName: l.student_name,
      mentorId: l.mentor_id, studentId: l.student_id, incident: l.incident, answers: parseAnswers(l.answers),
    })));
    setReviews(Object.fromEntries((reviewRows.data ?? []).map((r) => [r.log_id, { note: r.note, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at }])));
    setLastSignIn(access as Record<string, string | null>);

    // Actividad en el campus de los alumnos que se ven (tareas, SkillCoins, prácticas); sin el contenido.
    const studentIds = assignmentRows.map((a) => a.student_id);
    if (studentIds.length) {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.from("kiru_app_records")
        .select("owner_id,record_type,created_by,updated_at")
        .in("owner_id", studentIds)
        .gte("updated_at", since);
      if (error) throw new Error(`No se pudo cargar la actividad: ${error.message}`);
      setActivity(data ?? []);
    } else setActivity([]);
  }, []);

  useEffect(() => {
    let alive = true;
    const verifyRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/"); return; }
        const { data: profile, error } = await supabase.from("profiles").select("full_name,role,is_active").eq("id", user.id).single();
        // Administración también entra para ver a todos los mentores.
        const allowed = profile?.role === "coordinador" || profile?.role === "admin";
        if (error || !profile?.is_active || !allowed || user.app_metadata?.kiru_role !== profile.role) { router.replace("/"); return; }
        if (!alive) return;
        setMe({ id: user.id, name: profile.full_name, isAdmin: profile.role === "admin" });
        await load();
      } catch (error) {
        if (alive) setMsg({ text: error instanceof Error ? error.message : "No se pudieron cargar los datos.", type: "error" });
      } finally { if (alive) setAuthChecking(false); }
    };
    void verifyRole();
    return () => { alive = false; };
  }, [router, load]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const coordinators = people.filter((p) => p.role === "coordinador");
  const mentors = useMemo(() => people
    .filter((p) => p.role === "mentor")
    .filter((p) => coordinatorFilter === "todos" || (coordinatorFilter === "ninguno" ? !coordinatorOf[p.id] : coordinatorOf[p.id] === coordinatorFilter))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "es")), [people, coordinatorFilter, coordinatorOf]);
  const mentorIds = useMemo(() => new Set(mentors.map((m) => m.id)), [mentors]);
  const visibleLogs = logs.filter((l) => l.mentorId && mentorIds.has(l.mentorId));

  const summaries = useMemo(() => mentors.map((mentor) => {
    const students = Object.entries(mentorOf).filter(([, m]) => m === mentor.id).map(([s]) => byId.get(s)).filter((s): s is Person => Boolean(s));
    const mentorLogs = logs.filter((l) => l.mentorId === mentor.id);
    const recent = mentorLogs.filter((l) => (daysSince(l.sessionDate ?? l.submittedAt) ?? 999) <= WINDOW_DAYS);
    const lastLog = mentorLogs.map((l) => l.sessionDate ?? l.submittedAt.slice(0, 10)).sort().at(-1) ?? null;
    const studentRows = students.map((student) => {
      const own = mentorLogs.filter((l) => l.studentId === student.id);
      const last = own.map((l) => l.sessionDate ?? l.submittedAt.slice(0, 10)).sort().at(-1) ?? null;
      const practice = activity.filter((a) => a.owner_id === student.id && a.created_by === student.id).map((a) => a.updated_at).sort().at(-1) ?? null;
      const tasks = activity.filter((a) => a.owner_id === student.id && a.created_by === mentor.id && a.record_type === "task").length;
      const families = guardians.filter((g) => g.student_id === student.id).map((g) => byId.get(g.guardian_id)?.full_name).filter(Boolean) as string[];
      const stale = (daysSince(last) ?? 999) > STALE_DAYS;
      return { student, last, count: own.filter((l) => recent.includes(l)).length, practice, tasks, families, stale };
    });
    const mentorActivity = activity.filter((a) => a.created_by === mentor.id);
    return {
      mentor,
      students: studentRows,
      lastLog,
      recentCount: recent.length,
      lateCount: recent.filter((l) => isLate(l.sessionDate, l.submittedAt)).length,
      openIncidents: mentorLogs.filter((l) => l.incident && !reviews[l.id]).length,
      staleStudents: studentRows.filter((s) => s.stale).length,
      lastActivity: mentorActivity.map((a) => a.updated_at).sort().at(-1) ?? null,
      recentTasks: mentorActivity.filter((a) => a.record_type === "task" && (daysSince(a.updated_at) ?? 999) <= WINDOW_DAYS).length,
      logs: mentorLogs,
    };
  }), [mentors, mentorOf, byId, logs, activity, guardians, reviews]);

  const incidents = visibleLogs.filter((l) => l.incident);
  const openIncidents = incidents.filter((l) => !reviews[l.id]);
  const unassigned = logs.filter((l) => !l.mentorId || !l.studentId);
  const selected = summaries.find((s) => s.mentor.id === selectedMentor) ?? null;

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); await load(); }
    catch (error) { setMsg({ text: error instanceof Error ? error.message : "Ha ocurrido un error.", type: "error" }); }
    finally { setBusy(false); }
  };
  const review = (log: SessionLog, note: string) => run(async () => {
    if (!me) return;
    const { error } = await supabase.from("kiru_incident_reviews").upsert({ log_id: log.id, note: note.trim(), reviewed_by: me.id, reviewed_at: new Date().toISOString() });
    if (error) throw new Error(`No se pudo marcar como revisada: ${error.message}`);
    setMsg({ text: "Incidencia marcada como revisada.", type: "success" });
  });
  const reopen = (log: SessionLog) => run(async () => {
    const { error } = await supabase.from("kiru_incident_reviews").delete().eq("log_id", log.id);
    if (error) throw new Error(`No se pudo reabrir: ${error.message}`);
  });

  const logout = async () => { await supabase.auth.signOut(); router.replace("/"); };

  if (authChecking) return <main className="min-h-screen bg-[#F7F6F3] flex items-center justify-center text-sm text-slate-500">Comprobando permisos…</main>;
  if (!me) return msg ? <main className="min-h-screen bg-[#F7F6F3] p-6"><Toast text={msg.text} type={msg.type} onClose={() => setMsg(null)} /></main> : null;

  const totals = {
    students: summaries.reduce((n, s) => n + s.students.length, 0),
    recent: summaries.reduce((n, s) => n + s.recentCount, 0),
    stale: summaries.reduce((n, s) => n + s.staleStudents, 0),
  };

  return (
    <div className="min-h-screen bg-[#F7F6F3] text-[#343330] pb-16 font-sans">
      <header className="bg-white border-b border-[#E7E3DC] px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <Compass className="w-6 h-6 text-cyan-800" />
          <div>
            <h1 className="font-serif text-xl sm:text-2xl text-[#292825] font-bold">Panel del Coordinador</h1>
            <p className="text-[11px] sm:text-xs text-slate-500">Hola, {me.name}. Seguimiento de {me.isAdmin ? "todos los mentores" : "tus mentores"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {me.isAdmin && (
            <Link href="/admin" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Administración</span>
            </Link>
          )}
          <button onClick={logout} title="Cerrar sesión" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {msg && <Toast text={msg.text} type={msg.type} onClose={() => setMsg(null)} />}

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Mentores" value={mentors.length} />
          <Stat label="Alumnos" value={totals.students} />
          <Stat label={`Registros (${WINDOW_DAYS} días)`} value={totals.recent} />
          <Stat label="Incidencias sin revisar" value={openIncidents.length} warn={openIncidents.length > 0} />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <nav className="bg-white rounded-2xl border border-slate-200 p-1.5 flex flex-wrap gap-2 shadow-sm text-xs font-semibold w-fit">
            <TabButton active={tab === "mentores"} onClick={() => setTab("mentores")} icon={<Users className="w-3.5 h-3.5" />} label="Mis mentores" />
            <TabButton active={tab === "incidencias"} onClick={() => setTab("incidencias")} icon={<AlertTriangle className="w-3.5 h-3.5" />} label={`Incidencias${openIncidents.length ? ` (${openIncidents.length})` : ""}`} />
            <TabButton active={tab === "registros"} onClick={() => setTab("registros")} icon={<ClipboardList className="w-3.5 h-3.5" />} label="Registros de sesión" />
            <TabButton active={tab === "propuestas"} onClick={() => setTab("propuestas")} icon={<Compass className="w-3.5 h-3.5" />} label="Propuestas de alumnos" />
            {me.isAdmin && <TabButton active={tab === "sin-asignar"} onClick={() => setTab("sin-asignar")} icon={<AlertTriangle className="w-3.5 h-3.5" />} label={`Sin asignar${unassigned.length ? ` (${unassigned.length})` : ""}`} />}
          </nav>
          {me.isAdmin && (
            <select value={coordinatorFilter} onChange={(e) => { setCoordinatorFilter(e.target.value); setSelectedMentor(null); }} className="p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700">
              <option value="todos">Todos los coordinadores</option>
              {coordinators.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              <option value="ninguno">Mentores sin coordinador</option>
            </select>
          )}
        </div>

        {tab === "propuestas" && <OffersPanel notify={notifyOffers} />}

        {tab === "mentores" && (
          <>
            {mentors.length === 0 && (
              <p className="text-sm text-slate-500 bg-white rounded-3xl border border-[#E7E3DC] p-5">
                {me.isAdmin ? "No hay mentores con este filtro." : "Todavía no tienes mentores asignados. Administración los enlaza desde «Usuarios y Enlaces»."}
              </p>
            )}
            {totals.stale > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                {totals.stale} {totals.stale === 1 ? "alumno lleva" : "alumnos llevan"} más de {STALE_DAYS} días sin registro de sesión. Entra en el mentor para ver cuáles.
              </p>
            )}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {summaries.map((s) => {
                const ok = s.students.length > 0 && s.staleStudents === 0 && s.openIncidents === 0;
                return (
                  <button key={s.mentor.id} onClick={() => setSelectedMentor(selectedMentor === s.mentor.id ? null : s.mentor.id)}
                    className={`text-left bg-white rounded-3xl border p-5 shadow-sm transition hover:shadow-md ${selectedMentor === s.mentor.id ? "border-cyan-700 ring-2 ring-cyan-100" : "border-[#E7E3DC]"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="h-10 w-10 rounded-full bg-cyan-50 text-cyan-800 font-bold flex items-center justify-center">{s.mentor.full_name.charAt(0).toUpperCase()}</span>
                        <div>
                          <p className="font-bold text-slate-900">{s.mentor.full_name}</p>
                          <p className="text-[11px] text-slate-400">@{s.mentor.username}{me.isAdmin && coordinatorOf[s.mentor.id] ? ` · coord. ${byId.get(coordinatorOf[s.mentor.id])?.full_name ?? ""}` : ""}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold uppercase rounded-md px-2 py-0.5 ${s.students.length === 0 ? "bg-slate-100 text-slate-500" : ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {s.students.length === 0 ? "Sin alumnos" : ok ? "Al día" : "Revisar"}
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                      <Item label="Alumnos" value={String(s.students.length)} />
                      <Item label="Último registro" value={formatDate(s.lastLog)} />
                      <Item label={`Registros ${WINDOW_DAYS} días`} value={`${s.recentCount}${s.lateCount ? ` (${s.lateCount} tarde)` : ""}`} />
                      <Item label="Sin registro reciente" value={String(s.staleStudents)} warn={s.staleStudents > 0} />
                      <Item label="Entró al campus" value={ago(lastSignIn[s.mentor.id])} />
                      <Item label="Incidencias abiertas" value={String(s.openIncidents)} warn={s.openIncidents > 0} />
                      <Item label="Tareas enviadas" value={`${s.recentTasks} en ${WINDOW_DAYS} días`} />
                      <Item label="Última actividad" value={ago(s.lastActivity)} />
                    </dl>
                  </button>
                );
              })}
            </section>

            {selected && (
              <section className="bg-white rounded-3xl border border-[#E7E3DC] p-5 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-lg font-bold text-slate-900">{selected.mentor.full_name}</h2>
                  <button onClick={() => setSelectedMentor(null)} className="text-[11px] text-slate-400 hover:text-slate-700">Cerrar</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                        <th className="pb-2">Alumno</th><th className="pb-2">Familia</th><th className="pb-2">Último registro</th>
                        <th className="pb-2">Registros {WINDOW_DAYS} días</th><th className="pb-2">Practicó en el campus</th><th className="pb-2">Tareas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selected.students.map((row) => (
                        <tr key={row.student.id}>
                          <td className="py-2.5 font-semibold text-slate-900">{row.student.full_name}</td>
                          <td className="py-2.5 text-slate-500">{row.families.join(", ") || "—"}</td>
                          <td className={`py-2.5 ${row.stale ? "text-amber-700 font-semibold" : ""}`}>{row.last ? `${formatDate(row.last)} · ${ago(row.last)}` : "ninguno"}</td>
                          <td className="py-2.5">{row.count}</td>
                          <td className="py-2.5">{ago(row.practice)}</td>
                          <td className="py-2.5">{row.tasks}</td>
                        </tr>
                      ))}
                      {selected.students.length === 0 && <tr><td colSpan={6} className="py-3 text-slate-400">Este mentor aún no tiene alumnos.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Últimos registros de sesión</h3>
                  {selected.logs.length === 0 && <p className="text-xs text-slate-400">Todavía no hay registros de este mentor.</p>}
                  {selected.logs.slice(0, 15).map((log) => <LogCard key={log.id} log={log} review={reviews[log.id]} />)}
                </div>
              </section>
            )}
          </>
        )}

        {tab === "incidencias" && (
          <section className="space-y-3">
            <p className="text-xs text-slate-500">Lo que el mentor escribe en «Incidencia» al registrar la sesión. Márcala como revisada cuando la hayas hablado; la nota solo la ven coordinación y administración.</p>
            {incidents.length === 0 && <p className="text-sm text-slate-500">No hay incidencias.</p>}
            {[...openIncidents, ...incidents.filter((l) => reviews[l.id])].map((log) => (
              <IncidentCard key={log.id} log={log} review={reviews[log.id]} reviewer={reviews[log.id]?.reviewedBy ? byId.get(reviews[log.id].reviewedBy as string)?.full_name : undefined}
                busy={busy} onReview={(note) => void review(log, note)} onReopen={() => void reopen(log)} />
            ))}
          </section>
        )}

        {tab === "registros" && (
          <section className="space-y-2">
            <p className="text-xs text-slate-500">Respuestas del formulario «Registro de sesión», de la más reciente a la más antigua. Pulsa una para ver todo lo que escribió el mentor.</p>
            {visibleLogs.length === 0 && <p className="text-sm text-slate-500">Todavía no ha llegado ningún registro.</p>}
            {visibleLogs.slice(0, 100).map((log) => <LogCard key={log.id} log={log} review={reviews[log.id]} showMentor />)}
          </section>
        )}

        {tab === "sin-asignar" && me.isAdmin && (
          <section className="space-y-2">
            <p className="text-xs text-slate-500">Registros cuyo mentor o alumno no se ha podido reconocer. Suele ser porque el nombre del formulario no coincide con el de la cuenta del campus: corrige el nombre de la cuenta y en la siguiente importación se enlazan solos.</p>
            {unassigned.length === 0 && <p className="text-sm text-slate-500">Todos los registros están enlazados.</p>}
            {unassigned.slice(0, 100).map((log) => <LogCard key={log.id} log={log} review={reviews[log.id]} showMentor />)}
          </section>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${warn ? "bg-amber-50 border-amber-200" : "bg-white border-[#E7E3DC]"}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warn ? "text-amber-800" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Item({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className={`font-semibold ${warn ? "text-amber-700" : "text-slate-800"}`}>{value}</dd>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>
      {icon}<span>{label}</span>
    </button>
  );
}

function LogCard({ log, review, showMentor }: { log: SessionLog; review?: Review; showMentor?: boolean }) {
  const [open, setOpen] = useState(false);
  const late = isLate(log.sessionDate, log.submittedAt);
  const summary = findAnswer(log.answers, "Si tuvieras que resumir") || findAnswer(log.answers, "¿Qué se ha trabajado hoy");
  return (
    <article className="bg-white rounded-2xl border border-[#E7E3DC] px-4 py-3">
      <button onClick={() => setOpen(!open)} className="w-full text-left flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900">
            {formatDate(log.sessionDate)} · {log.studentName || "Sin alumno"}{showMentor ? <span className="text-slate-400 font-normal"> · {log.mentorName || "sin mentor"}</span> : null}
          </p>
          {summary && <p className="text-[11px] text-slate-500 truncate">{summary}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {late && <span className="text-[10px] rounded-md bg-slate-100 text-slate-600 px-1.5 py-0.5">enviado el {formatDate(log.submittedAt)}</span>}
          {log.incident && <span className={`text-[10px] rounded-md px-1.5 py-0.5 ${review ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>incidencia</span>}
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>
      {open && (
        <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {log.incident && <Answer q="Incidencia" a={log.incident} warn />}
          {log.answers.map((item, i) => <Answer key={i} q={item.q} a={item.a} />)}
        </dl>
      )}
    </article>
  );
}

function Answer({ q, a, warn }: { q: string; a: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] text-slate-400">{q.split("\n")[0]}</dt>
      <dd className={`text-xs whitespace-pre-line ${warn ? "text-amber-800 font-semibold" : "text-slate-700"}`}>{a}</dd>
    </div>
  );
}

function IncidentCard({ log, review, reviewer, busy, onReview, onReopen }: {
  log: SessionLog; review?: Review; reviewer?: string; busy: boolean; onReview: (note: string) => void; onReopen: () => void;
}) {
  const [note, setNote] = useState("");
  return (
    <article className={`rounded-3xl border p-5 ${review ? "bg-white border-[#E7E3DC]" : "bg-amber-50/60 border-amber-200"}`}>
      <p className="text-[11px] text-slate-500">{formatDate(log.sessionDate)} · {log.mentorName} con {log.studentName}</p>
      <p className="mt-1 text-sm text-slate-900">{log.incident}</p>
      {review ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-emerald-800 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Revisada {formatDate(review.reviewedAt)}{reviewer ? ` por ${reviewer}` : ""}{review.note ? `: ${review.note}` : ""}
          </p>
          <button disabled={busy} onClick={onReopen} className="text-[11px] text-slate-400 hover:text-slate-700">Reabrir</button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Qué has hecho (opcional): hablado con el mentor, llamada a la familia…" className="flex-1 p-2.5 rounded-xl border border-slate-200 bg-white text-xs" />
          <button disabled={busy} onClick={() => onReview(note)} className="rounded-xl bg-cyan-800 px-3 py-2.5 text-[11px] font-semibold text-white hover:bg-cyan-900 disabled:opacity-50">Marcar como revisada</button>
        </div>
      )}
    </article>
  );
}
