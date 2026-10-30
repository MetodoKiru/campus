"use client";

import { useCallback, useEffect, useState } from "react";
import { EMPTY_SUMMARY, errorText, fetchGoals, fetchMovements, fetchRewards, fetchSummary, type Reward, type RewardGoal, type SkillcoinMovement, type SkillcoinSummary } from "@/lib/skillcoins";

/**
 * Saldo, catálogo, objetivos e historial de un alumno. Se vuelve a pedir al
 * volver a la pestaña y cada minuto, para que la barra se mueva sola cuando
 * llegan SkillCoins nuevas o la familia responde.
 */
export function useStudentSkillcoins(studentId: string | null) {
  const [summary, setSummary] = useState<SkillcoinSummary>(EMPTY_SUMMARY);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [goals, setGoals] = useState<RewardGoal[]>([]);
  const [movements, setMovements] = useState<SkillcoinMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!studentId) return;
    try {
      const [nextSummary, nextRewards, nextGoals, nextMovements] = await Promise.all([
        fetchSummary(studentId), fetchRewards(), fetchGoals([studentId]), fetchMovements([studentId]),
      ]);
      setSummary(nextSummary);
      setRewards(nextRewards);
      setGoals(nextGoals);
      setMovements(nextMovements);
      setError("");
    } catch (err) {
      setError(errorText(err, "No se pudieron cargar tus SkillCoins."));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    // La primera carga va en un temporizador para no encadenar renders dentro del efecto.
    const first = window.setTimeout(() => { void reload(); }, 0);
    const interval = window.setInterval(() => { void reload(); }, 60_000);
    const onFocus = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.clearTimeout(first); window.clearInterval(interval); document.removeEventListener("visibilitychange", onFocus); };
  }, [studentId, reload]);

  return { summary, rewards, goals, movements, loading, error, reload };
}
