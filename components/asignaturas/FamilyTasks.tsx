"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { STATUS_LABEL, STATUS_STYLE, fetchFamilyTasks, formatDue, formatMoment, lateBy, type FamilySubjectTaskRow } from "@/lib/subjects";

/**
 * Tareas del alumno para la familia: solo asignatura, título, plazo y si llegó a tiempo.
 * Ni el contenido ni los archivos (decisión de Sofía, 18/11/2026).
 */
export default function FamilyTasks({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [rows, setRows] = useState<FamilySubjectTaskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchFamilyTasks(studentId)
      .then((data) => { if (alive) { setRows(data); setError(null); } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "No se pudieron cargar las tareas."); });
    return () => { alive = false; };
  }, [studentId]);

  if (error) return null;
  if (!rows || rows.length === 0) return null;

  const done = rows.filter((r) => r.status !== "pendiente");
  const onTime = done.filter((r) => r.status === "a_tiempo").length;

  return (
    <section className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E7E3DC] shadow-xs space-y-4">
      <div className="space-y-1">
        <h3 className="font-serif text-lg text-[#292825] font-bold flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Tareas de {studentName}</h3>
        <p className="text-xs text-[#77736B]">
          Tareas que su mentor le ha puesto en el campus y si las entregó a tiempo.
          {done.length > 0 && <> Con plazo cumplido: <strong>{onTime} de {done.length}</strong> a tiempo.</>}
        </p>
      </div>
      <ul className="divide-y divide-[#F0ECE6]">
        {rows.slice(0, 20).map((r) => (
          <li key={r.item_id} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A775B]">{r.subject_name}</p>
              <p className="text-xs font-semibold text-[#292825] truncate">{r.title}</p>
              <p className="text-[11px] text-[#77736B]">
                Entrega: {formatDue(r.due_at, r.time_zone)}
                {r.first_submitted_at && <> · entregada el {formatMoment(r.first_submitted_at)}{r.status === "tarde" && ` (${lateBy(r.due_at, r.first_submitted_at)})`}</>}
              </p>
            </div>
            <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[10px] font-bold ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
