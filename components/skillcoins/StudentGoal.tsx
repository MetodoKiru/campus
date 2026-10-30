"use client";

import { useState } from "react";
import { Gift, Hourglass, Sparkles, Target } from "lucide-react";
import ProgressBar from "@/components/skillcoins/ProgressBar";
import { cancelGoal, errorText, goalLabel, motivation, openGoals, progressOf, requestRedeem, type RewardGoal } from "@/lib/skillcoins";

type Props = {
  studentId: string;
  balance: number;
  goals: RewardGoal[];
  onChanged: () => Promise<void> | void;
  onOpenShop: () => void;
  onMessage: (text: string, type?: "success" | "error") => void;
};

/** La recompensa objetivo, con protagonismo en «Mi panel». */
export default function StudentGoal({ studentId, balance, goals, onChanged, onOpenShop, onMessage }: Props) {
  const { active, pending, last } = openGoals(goals, studentId);
  const [askingParents, setAskingParents] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await action(); onMessage(ok); await onChanged(); }
    catch (err) { onMessage(errorText(err), "error"); }
    finally { setBusy(false); setAskingParents(false); }
  };

  // Sin objetivo activo: invitación a la tienda (y aviso si la última se rechazó o si hay una pendiente).
  const main = active ?? pending;
  if (!main) {
    return (
      <section className="rounded-3xl border border-dashed border-[#D9CDB8] bg-[#FBF9F5] p-6 sm:p-8 text-center space-y-3">
        <Target className="w-8 h-8 text-[#8A775B] mx-auto" />
        <h2 className="text-xl font-serif font-bold text-[#292825]">Elige tu recompensa objetivo</h2>
        <p className="text-sm text-[#6D6962] max-w-md mx-auto">
          {last?.status === "rechazado"
            ? `Tu familia prefiere otra opción en lugar de «${last.reward_name}». Mira la tienda y elige otra.`
            : last?.status === "completado"
              ? `¡Conseguiste «${last.reward_name}»! ¿Cuál será tu próximo objetivo?`
              : "Entra en la tienda, elige la recompensa que más te motive y envíasela a tu familia."}
        </p>
        <button onClick={onOpenShop} className="px-5 py-2.5 rounded-xl bg-[#242321] text-white text-sm font-semibold hover:bg-[#3A3835]">
          Ir a la tienda
        </button>
      </section>
    );
  }

  const isPendingOnly = !active && !!pending;
  const { reached } = progressOf(main.cost, balance);

  return (
    <section className="rounded-3xl bg-[#242321] text-white p-6 sm:p-8 space-y-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider font-bold text-[#D7C8AF] flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> Mi recompensa objetivo
          </p>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold">{main.reward_name}</h2>
          <p className="text-xs text-[#CFC6B8]">{main.reward_category} · {main.cost.toLocaleString("es-ES")} SC</p>
        </div>
        <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${
          isPendingOnly ? "bg-[#4A4436] text-[#F0E3C8]" : reached ? "bg-[#4F6B4A] text-white" : "bg-white/10 text-[#F0E3C8]"
        }`}>
          {goalLabel(main, balance)}
        </span>
      </div>

      <ProgressBar cost={main.cost} balance={balance} size="lg" dark />

      {active?.status !== "canje_solicitado" && (
        <p className="text-sm text-[#E8E2D8] flex items-start gap-2">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-[#D7C8AF]" />
          {isPendingOnly ? "Tu familia tiene que aprobarla. Mientras tanto, ¡sigue sumando SkillCoins!" : motivation(main.cost, balance)}
        </p>
      )}

      {active?.status === "canje_solicitado" && (
        <div className="rounded-2xl bg-white/10 p-4 text-sm flex items-start gap-2">
          <Hourglass className="w-4 h-4 shrink-0 mt-0.5" />
          Se lo has pedido a tu familia. Te avisaremos en cuanto confirmen la entrega.
        </div>
      )}

      {active?.status === "aprobado" && reached && !pending && (
        askingParents ? (
          <div className="rounded-2xl bg-white p-4 text-[#292825] space-y-3">
            <p className="text-sm">Tu familia recibirá un aviso y un correo para entregarte <strong>{active.reward_name}</strong>. Las SkillCoins se descontarán cuando lo confirmen.</p>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => run(() => requestRedeem(active.id), "¡Petición enviada a tu familia!")} className="px-4 py-2.5 rounded-xl bg-[#242321] text-white text-sm font-bold disabled:opacity-50">
                {busy ? "Enviando…" : "Pedir a mis padres"}
              </button>
              <button disabled={busy} onClick={() => setAskingParents(false)} className="px-4 py-2.5 rounded-xl border border-[#E7E3DC] text-sm">Ahora no</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAskingParents(true)} className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-[#F0E3C8] text-[#292825] text-base font-bold hover:bg-white transition flex items-center justify-center gap-2 animate-in fade-in">
            <Gift className="w-5 h-5" /> ¡Ya puedo conseguir mi recompensa!
          </button>
        )
      )}

      {active && pending && (
        <div className="rounded-2xl bg-white/10 p-4 text-sm space-y-2">
          <p>Has pedido cambiar tu objetivo por <strong>{pending.reward_name}</strong> ({pending.cost} SC). Tu familia tiene que aprobarlo; mientras tanto sigue vigente el actual.</p>
          <button disabled={busy} onClick={() => run(() => cancelGoal(pending.id), "Has retirado el cambio.")} className="text-xs underline text-[#E8E2D8] disabled:opacity-50">Retirar el cambio</button>
        </div>
      )}

      {isPendingOnly && (
        <button disabled={busy} onClick={() => run(() => cancelGoal(pending.id), "Has retirado tu elección.")} className="text-xs underline text-[#E8E2D8] disabled:opacity-50">
          Prefiero elegir otra
        </button>
      )}

      {active?.status === "aprobado" && !pending && (
        <button onClick={onOpenShop} className="text-xs underline text-[#E8E2D8]">Pedir cambiar de objetivo</button>
      )}
    </section>
  );
}
