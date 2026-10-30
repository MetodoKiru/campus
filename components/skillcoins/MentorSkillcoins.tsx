"use client";

import { useEffect, useState } from "react";
import SkillCoinsChart from "@/components/SkillCoinsChart";
import { useStudentSkillcoins } from "@/components/skillcoins/useStudentSkillcoins";
import { correctWeek, errorText, weekLabel, type SkillcoinScores } from "@/lib/skillcoins";
import { supabase } from "@/lib/supabase";
import type { SkillcoinCorrectionRow } from "@/lib/database.types";

const CATEGORIES = [
  { id: "estudios", label: "Estudios" },
  { id: "compromiso", label: "Compromiso" },
  { id: "organizacion", label: "Organización" },
  { id: "bienestar", label: "Bienestar" },
] as const;

/**
 * SkillCoins de un alumno para su mentor. Las notas salen de la hoja de
 * sesiones; el mentor solo puede corregir la semana actual y cada corrección
 * queda registrada. Las semanas anteriores las corrige administración.
 */
export default function MentorSkillcoins({ student, onStatus }: { student?: { id: string; username: string; name: string }; onStatus: (text: string) => void }) {
  const { summary, reload } = useStudentSkillcoins(student?.id ?? null);
  const current = summary.weeks.find((w) => w.week === summary.currentWeek);
  const [draft, setDraft] = useState<SkillcoinScores | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState<SkillcoinCorrectionRow[]>([]);
  const values: SkillcoinScores = draft ?? {
    estudios: current?.estudios ?? 0, compromiso: current?.compromiso ?? 0, organizacion: current?.organizacion ?? 0, bienestar: current?.bienestar ?? 0,
  };

  useEffect(() => {
    if (!student) return;
    let alive = true;
    void supabase.from("kiru_skillcoin_corrections").select("*").eq("student_id", student.id).order("created_at", { ascending: false }).limit(10)
      .then(({ data }) => { if (alive) setLog(data ?? []); });
    return () => { alive = false; };
  }, [student, summary]);

  if (!student) return <div className="bg-white p-6 rounded-3xl border border-[#E7E3DC] text-sm text-[#77736B]">No tienes alumnos asignados todavía.</div>;

  const save = async () => {
    if (!summary.currentWeek) return;
    setSaving(true);
    try {
      await correctWeek(student.id, summary.currentWeek, values, reason);
      setDraft(null);
      setReason("");
      await reload();
      onStatus("Corrección guardada. Las SkillCoins se han recalculado.");
    } catch (err) {
      onStatus("No se pudo guardar: " + errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4">
        <div className="flex justify-between items-start gap-3 border-b border-[#EEEAE3] pb-3 flex-wrap">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#292825]">SkillCoins de {student.name}</h3>
            <p className="text-xs text-[#77736B]">Las notas llegan del «Registro de sesión». Aquí puedes corregir solo la semana actual; las anteriores las corrige administración.</p>
          </div>
          <div className="text-right text-xs text-[#6D6962]">
            <p>Saldo: <strong className="text-[#292825]">{summary.balance} SC</strong></p>
            <p>Ganadas {summary.earned} · Canjeadas {summary.spent}</p>
          </div>
        </div>

        <p className="text-xs font-bold uppercase tracking-wider text-[#8A775B]">
          {summary.currentWeek ? weekLabel(summary.currentWeek) : "Semana actual"} {current ? (current.corrected ? "· corregida" : "· de la hoja") : "· sin registro todavía"}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CATEGORIES.map((cat) => (
            <label key={cat.id} className="p-3.5 bg-[#FAF8F5] border border-[#E7E3DC] rounded-2xl space-y-2 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#77736B] block">{cat.label}</span>
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={values[cat.id]}
                  onChange={(e) => setDraft({ ...values, [cat.id]: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)) })}
                  className="w-16 p-2 bg-white border border-[#E7E3DC] rounded-xl text-center text-sm font-bold text-[#45433F]"
                />
                <span className="text-xs text-[#8D887F] font-semibold">/ 10 SC</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Motivo de la corrección (opcional)"
            className="flex-1 p-2.5 border border-[#E7E3DC] rounded-xl text-sm"
          />
          <button
            disabled={!draft || saving}
            onClick={() => void save()}
            className="px-5 py-2.5 rounded-xl bg-[#242321] text-white text-sm font-semibold disabled:opacity-40"
          >
            {saving ? "Guardando…" : "Guardar corrección"}
          </button>
        </div>

        {log.length > 0 && (
          <details className="text-xs text-[#6D6962]">
            <summary className="cursor-pointer font-bold">Correcciones registradas</summary>
            <ul className="mt-2 space-y-1">
              {log.map((c) => (
                <li key={c.id}>
                  {new Date(c.created_at).toLocaleString("es-ES")} · {weekLabel(c.week)} · {c.estudios}/{c.compromiso}/{c.organizacion}/{c.bienestar}
                  {c.corrected_role === "admin" ? " · administración" : ""}{c.reason ? ` · «${c.reason}»` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E7E3DC] shadow-xs space-y-4">
        <SkillCoinsChart weeks={summary.weeks} />
      </div>
    </div>
  );
}
