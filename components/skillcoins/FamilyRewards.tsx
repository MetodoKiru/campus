"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Gift, History, Hourglass, Target, XCircle } from "lucide-react";
import ProgressBar from "@/components/skillcoins/ProgressBar";
import Toast from "@/components/Toast";
import { STATUS_LABEL, decideGoal, errorText, fetchGoals, fetchMovements, fetchSummary, goalLabel, openGoals, resolveRedeem, type RewardGoal, type SkillcoinMovement, type SkillcoinSummary } from "@/lib/skillcoins";

type Child = { id: string; name: string };
type ChildData = { summary: SkillcoinSummary | null; error: string };

/** Panel de familias: solicitudes de objetivo, objetivo aprobado, canjes y su historial. */
export default function FamilyRewards({ students, onChanged }: { students: Child[]; onChanged?: () => void }) {
  const [goals, setGoals] = useState<RewardGoal[]>([]);
  const [movements, setMovements] = useState<SkillcoinMovement[]>([]);
  const [byChild, setByChild] = useState<Record<string, ChildData>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const ids = students.map((s) => s.id).join(",");

  const reload = useCallback(async () => {
    const studentIds = ids ? ids.split(",") : [];
    try {
      const [nextGoals, nextMovements, summaries] = await Promise.all([
        fetchGoals(studentIds),
        fetchMovements(studentIds),
        Promise.all(studentIds.map(async (id) => {
          try { return [id, { summary: await fetchSummary(id), error: "" }] as const; }
          catch (err) { return [id, { summary: null, error: errorText(err) }] as const; }
        })),
      ]);
      setGoals(nextGoals);
      setMovements(nextMovements);
      setByChild(Object.fromEntries(summaries));
    } catch (err) {
      setToast({ text: errorText(err, "No se pudieron cargar las recompensas."), type: "error" });
    } finally {
      setLoaded(true);
    }
  }, [ids]);

  useEffect(() => {
    const first = window.setTimeout(() => { void reload(); }, 0);
    const onFocus = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.clearTimeout(first); document.removeEventListener("visibilitychange", onFocus); };
  }, [reload]);

  const act = async (goalId: string, action: () => Promise<unknown>, ok: string) => {
    setBusy(goalId);
    try { await action(); setToast({ text: ok, type: "success" }); await reload(); onChanged?.(); }
    catch (err) { setToast({ text: errorText(err), type: "error" }); await reload(); }
    finally { setBusy(null); }
  };

  if (!students.length) {
    return <div className="bg-white p-6 rounded-3xl border border-[#E7E3DC] text-sm text-[#77736B]">Todavía no hay ningún alumno vinculado a tu cuenta.</div>;
  }

  return (
    <div className="space-y-6">
      {toast && <Toast text={toast.text} type={toast.type} onClose={() => setToast(null)} />}
      <div className="bg-white p-6 rounded-3xl border border-[#E7E3DC] space-y-1">
        <h2 className="text-xl font-serif font-bold text-[#292825]">Recompensas SkillCoins</h2>
        <p className="text-xs text-[#77736B] leading-relaxed">
          Aprobar un objetivo no lo canjea: solo autoriza a tu hijo/a a trabajar para conseguirlo. Las SkillCoins se descuentan únicamente cuando confirmáis la entrega.
        </p>
      </div>

      {students.map((child) => {
        const data = byChild[child.id];
        const balance = data?.summary?.balance ?? 0;
        const { active, pending } = openGoals(goals, child.id);
        const history = goals.filter((g) => g.student_id === child.id && !["pendiente", "aprobado", "canje_solicitado"].includes(g.status));
        const spent = movements.filter((m) => m.student_id === child.id);
        const note = (id: string) => notes[id] ?? "";
        return (
          <section key={child.id} className="bg-white rounded-3xl border border-[#E7E3DC] p-5 sm:p-6 space-y-5">
            <div className="flex items-end justify-between gap-3 flex-wrap border-b border-[#EEEAE4] pb-3">
              <h3 className="text-lg font-serif font-bold text-[#292825]">{child.name}</h3>
              <p className="text-sm text-[#6D6962]">Saldo: <strong className="text-[#292825]">{balance.toLocaleString("es-ES")} SC</strong></p>
            </div>
            {data?.error && <p className="text-xs text-rose-700">{data.error}</p>}
            {!loaded && <p className="text-xs text-[#77736B]">Cargando…</p>}

            {/* Solicitud pendiente: objetivo nuevo o cambio */}
            {pending && (
              <div className="rounded-2xl border-2 border-[#E4D8C5] bg-[#FBF8F2] p-4 space-y-3">
                <p className="text-[11px] uppercase font-bold tracking-wider text-[#8A775B] flex items-center gap-1.5"><Hourglass className="w-3.5 h-3.5" /> {active ? "Quiere cambiar de objetivo" : "Solicitud pendiente"}</p>
                <div>
                  <p className="font-semibold text-[#292825]">{pending.reward_name} <span className="text-[#77736B] font-normal">· {pending.reward_category}</span></p>
                  {active && <p className="text-xs text-[#77736B]">Sustituiría a «{active.reward_name}».</p>}
                </div>
                <ProgressBar cost={pending.cost} balance={balance} />
                <input
                  value={note(pending.id)}
                  onChange={(e) => setNotes((n) => ({ ...n, [pending.id]: e.target.value }))}
                  maxLength={500}
                  placeholder="Mensaje para tu hijo/a (opcional)"
                  className="w-full p-2.5 rounded-xl border border-[#E7E3DC] text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy === pending.id} onClick={() => act(pending.id, () => decideGoal(pending.id, true, note(pending.id)), "Objetivo aprobado. Le hemos avisado.")} className="px-4 py-2.5 rounded-xl bg-[#242321] text-white text-sm font-bold disabled:opacity-50 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Aprobar recompensa
                  </button>
                  <button disabled={busy === pending.id} onClick={() => act(pending.id, () => decideGoal(pending.id, false, note(pending.id)), "Solicitud rechazada. Le hemos avisado.")} className="px-4 py-2.5 rounded-xl border border-[#E7E3DC] text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4" /> Rechazar
                  </button>
                </div>
              </div>
            )}

            {/* Objetivo activo y canje */}
            {active ? (
              <div className={`rounded-2xl p-4 space-y-3 ${active.status === "canje_solicitado" ? "border-2 border-[#B9CDB3] bg-[#F4F8F2]" : "border border-[#E7E3DC] bg-[#FAF8F4]"}`}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="font-semibold text-[#292825] flex items-center gap-1.5"><Target className="w-4 h-4 text-[#8A775B]" /> {active.reward_name}</p>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white border border-[#E7E3DC]">{goalLabel(active, balance)}</span>
                </div>
                <ProgressBar cost={active.cost} balance={balance} />
                {active.status === "canje_solicitado" && (
                  <div className="space-y-2">
                    <p className="text-sm text-[#3F5A3A] flex items-start gap-1.5"><Gift className="w-4 h-4 shrink-0 mt-0.5" /> Ha conseguido las SkillCoins y os pide su recompensa.</p>
                    <input
                      value={note(active.id)}
                      onChange={(e) => setNotes((n) => ({ ...n, [active.id]: e.target.value }))}
                      maxLength={500}
                      placeholder="Mensaje para tu hijo/a (opcional)"
                      className="w-full p-2.5 rounded-xl border border-[#E7E3DC] text-sm bg-white"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button disabled={busy === active.id} onClick={() => act(active.id, () => resolveRedeem(active.id, true, note(active.id)), `Canje confirmado. Se han descontado ${active.cost} SC.`)} className="px-4 py-2.5 rounded-xl bg-[#3F5A3A] text-white text-sm font-bold disabled:opacity-50">
                        Confirmar entrega y descontar {active.cost} SC
                      </button>
                      <button disabled={busy === active.id} onClick={() => act(active.id, () => resolveRedeem(active.id, false, note(active.id)), "De acuerdo. Su objetivo sigue aprobado y podrá volver a pedirlo.")} className="px-4 py-2.5 rounded-xl border border-[#E7E3DC] bg-white text-sm font-semibold disabled:opacity-50">
                        Todavía no
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : !pending && loaded ? (
              <p className="text-sm text-[#77736B]">Todavía no ha elegido ninguna recompensa objetivo.</p>
            ) : null}

            {(history.length > 0 || spent.length > 0) && (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-[#6D6962] flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Historial</summary>
                <ul className="mt-3 space-y-1.5">
                  {spent.map((m) => (
                    <li key={m.id} className="flex justify-between gap-3 text-xs border-b border-[#EEEAE4] pb-1.5">
                      <span>{new Date(m.created_at).toLocaleDateString("es-ES")} · {m.reason}</span>
                      <strong>{m.amount} SC</strong>
                    </li>
                  ))}
                  {history.filter((g) => g.status !== "completado").map((g) => (
                    <li key={g.id} className="flex justify-between gap-3 text-xs text-[#77736B] border-b border-[#EEEAE4] pb-1.5">
                      <span>{new Date(g.created_at).toLocaleDateString("es-ES")} · {g.reward_name}</span>
                      <span>{STATUS_LABEL[g.status]}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
