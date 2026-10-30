"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Coins, Target } from "lucide-react";
import ProgressBar from "@/components/skillcoins/ProgressBar";
import { chooseReward, errorText, groupByCategory, openGoals, progressOf, type Reward, type RewardGoal, type SkillcoinSummary } from "@/lib/skillcoins";

type Props = {
  studentId: string;
  summary: SkillcoinSummary;
  rewards: Reward[];
  goals: RewardGoal[];
  loading: boolean;
  onChanged: () => Promise<void> | void;
  onMessage: (text: string, type?: "success" | "error") => void;
};

const ALL = "__todas__";

/** Tienda: catálogo por categorías, cada recompensa con su barra y «Elegir como objetivo». */
export default function StudentShop({ studentId, summary, rewards, goals, loading, onChanged, onMessage }: Props) {
  const [category, setCategory] = useState(ALL);
  const [confirming, setConfirming] = useState<Reward | null>(null);
  const [busy, setBusy] = useState(false);
  const { active, pending } = openGoals(goals, studentId);
  const balance = summary.balance;
  const groups = groupByCategory(rewards);
  const visible = category === ALL ? groups : groups.filter((g) => g.category === category);
  const closest = rewards.filter((r) => r.cost > balance).sort((a, b) => a.cost - b.cost).slice(0, 3);

  const choose = async (reward: Reward) => {
    setBusy(true);
    try {
      await chooseReward(reward.id);
      onMessage(active ? `Has pedido cambiar tu objetivo por «${reward.name}». Tu familia lo revisará.` : `¡«${reward.name}» enviada a tu familia! Está pendiente de aprobación.`);
      setConfirming(null);
      await onChanged();
    } catch (err) {
      onMessage(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const blockedReason = active?.status === "canje_solicitado"
    ? "Has pedido el canje de tu objetivo. Cuando tu familia responda podrás elegir otro."
    : pending
      ? `Tu elección «${pending.reward_name}» está esperando a tu familia.`
      : "";

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="rounded-3xl bg-[#242321] text-white p-6 sm:p-8 space-y-3">
        <p className="text-xs uppercase tracking-wider text-[#D7C8AF] font-bold">Tienda SkillCoins</p>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-4xl font-serif font-bold flex items-center gap-2"><Coins className="w-8 h-8 text-[#D7C8AF]" />{balance.toLocaleString("es-ES")} SC</p>
            <p className="text-sm text-[#E8E2D8]">Tu saldo disponible</p>
          </div>
          {active && (
            <div className="text-right text-sm">
              <p className="text-[#D7C8AF] text-xs uppercase font-bold">Tu objetivo</p>
              <p className="font-semibold">{active.reward_name}</p>
            </div>
          )}
        </div>
        <p className="text-xs text-[#E8E2D8]">Elige una recompensa como objetivo y tu familia la revisará. Las SkillCoins solo se descuentan cuando tu familia confirma la entrega.</p>
      </div>

      {blockedReason && (
        <p className="rounded-2xl bg-[#F3EEE5] border border-[#E4D8C5] p-4 text-sm text-[#5C5141] flex items-start gap-2">
          <Clock className="w-4 h-4 shrink-0 mt-0.5" /> {blockedReason}
        </p>
      )}

      {closest.length > 0 && !loading && (
        <section className="bg-white rounded-3xl border border-[#E7E3DC] p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-xl font-serif font-bold">¡Estás cada vez más cerca!</h2>
            <p className="text-sm text-[#77736B]">Las recompensas que tienes más a mano.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {closest.map((reward) => (
              <article key={reward.id} className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F4] p-4 space-y-2">
                <span className="text-[10px] uppercase tracking-wide text-[#8A775B] font-bold">{reward.category}</span>
                <h3 className="font-semibold text-[#292825]">{reward.name}</h3>
                <ProgressBar cost={reward.cost} balance={balance} />
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Categorías */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Categorías">
        {[{ category: ALL, rewards }, ...groups].map((group) => (
          <button
            key={group.category}
            role="tab"
            aria-selected={category === group.category}
            onClick={() => setCategory(group.category)}
            className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold border transition ${
              category === group.category ? "bg-[#242321] text-white border-[#242321]" : "bg-white text-[#6D6962] border-[#E7E3DC] hover:bg-[#F5F2EC]"
            }`}
          >
            {group.category === ALL ? "Todas" : group.category} <span className="opacity-60">· {group.rewards.length}</span>
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-[#77736B]">Cargando el catálogo…</p>}

      {visible.map((group) => (
        <section key={group.category} className="space-y-3">
          <h2 className="text-lg font-serif font-bold text-[#292825]">{group.category}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.rewards.map((reward) => {
              const isActive = active?.reward_id === reward.id;
              const isPending = pending?.reward_id === reward.id;
              const { reached } = progressOf(reward.cost, balance);
              return (
                <article
                  key={reward.id}
                  className={`rounded-2xl border p-4 space-y-3 bg-white transition ${
                    isActive ? "border-[#8A775B] ring-2 ring-[#E4D8C5]" : reached ? "border-[#B9CDB3]" : "border-[#E7E3DC]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm text-[#292825]">{reward.name}</h3>
                    <span className="shrink-0 rounded-full bg-[#F3EEE5] px-2.5 py-0.5 text-[11px] font-bold text-[#5C5141]">{reward.cost.toLocaleString("es-ES")} SC</span>
                  </div>
                  <ProgressBar cost={reward.cost} balance={balance} />
                  {isActive ? (
                    <p className="text-xs font-bold text-[#8A775B] flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> Tu objetivo</p>
                  ) : isPending ? (
                    <p className="text-xs font-bold text-[#8A775B] flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Pendiente de aprobación</p>
                  ) : confirming?.id === reward.id ? (
                    <div className="space-y-2">
                      <p className="text-xs text-[#5C5141]">{active ? `¿Pedir a tu familia cambiar «${active.reward_name}» por esta?` : "¿Enviar esta recompensa a tu familia para que la aprueben?"}</p>
                      <div className="flex gap-2">
                        <button disabled={busy} onClick={() => choose(reward)} className="px-3 py-2 rounded-xl bg-[#242321] text-white text-xs font-bold disabled:opacity-50">{busy ? "Enviando…" : "Sí, enviar"}</button>
                        <button disabled={busy} onClick={() => setConfirming(null)} className="px-3 py-2 rounded-xl border border-[#E7E3DC] text-xs">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      disabled={!!blockedReason}
                      onClick={() => setConfirming(reward)}
                      className="w-full px-3 py-2 rounded-xl border border-[#242321] text-[#242321] text-xs font-bold hover:bg-[#242321] hover:text-white transition disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#242321]"
                    >
                      {active ? "Cambiar mi objetivo por esta" : "Elegir como objetivo"}
                    </button>
                  )}
                  {reached && !isActive && <p className="text-[11px] text-[#4F6B4A] flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Ya tienes las SC necesarias</p>}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-xs leading-relaxed text-[#77736B] bg-[#F3F0EA] rounded-2xl p-4">
        Las SkillCoins son virtuales. Tu familia aprueba las recompensas y se encarga de comprarlas y entregarlas. Las recompensas que no estén en el catálogo se acuerdan con tu familia y tu mentor. Cuando tu familia confirma la entrega, se descuentan las SkillCoins utilizadas.
      </p>
    </div>
  );
}
