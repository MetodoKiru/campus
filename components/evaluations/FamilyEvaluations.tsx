"use client";

import { ClipboardList } from "lucide-react";
import { card, subtle } from "@/components/classes/shared";
import { shortEvalDate, type FamilyEvaluationView } from "@/lib/evaluations";
import { useEvaluations } from "./api";

/**
 * Tarjeta del panel de padres cuando toca la evaluación (inicial o trimestral) de
 * un hijo/a: explica qué es, para qué sirve y lleva al formulario. Desaparece sola
 * cuando llega la respuesta.
 */
export default function FamilyEvaluations({ studentId, onOpenReports }: { studentId: string; onOpenReports?: () => void }) {
  const { data } = useEvaluations<{ evaluations: FamilyEvaluationView[] }>();
  const items = (data?.evaluations ?? []).filter((e) => e.studentId === studentId);
  if (!items.length) return null;
  return (
    <div className="space-y-4">
      {items.map((e) => (
        <section key={e.id} className={`${card} space-y-3 border-2 border-[#E4D8C5]`} aria-label="Evaluación pendiente">
          <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]">
            <ClipboardList className="h-5 w-5" /> {e.cycle === 0 ? "Evaluación inicial" : "Evaluación trimestral"} de {e.studentName}
          </h3>
          <p className="text-xs leading-relaxed text-[#45433F]">
            {e.cycle === 0
              ? <>Para empezar con buen pie, os pedimos que nos contéis cómo veis a {e.studentName} en casa.</>
              : <>{e.studentName} ya lleva otros 3 meses con nosotros. Os pedimos que nos contéis cómo lo veis en casa.</>}
            {" "}Son preguntas sobre organización, tiempo, rutinas, autonomía, atención y cómo se conoce a sí mismo/a. Unos 5-10 minutos.
          </p>
          <div className={`${subtle} text-xs text-[#45433F] space-y-1`}>
            <p><strong>¿Para qué sirve?</strong> Vuestra mirada se suma a lo que ve su mentor/a en las sesiones y a la evaluación en papel que hace {e.studentName}. Con las tres preparamos su informe y los objetivos de los próximos 3 meses.</p>
            <p>No es un examen: no hay respuestas buenas ni malas.</p>
          </div>
          {e.holiday && (
            <p className={`${subtle} text-xs text-[#45433F]`}>
              Esta evaluación coincide con <strong>{e.holiday}</strong>. Si ya sabéis vuestros planes, contestad también el formulario de {e.holiday} (en esta misma página) para que podamos organizarnos.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <a href={e.link} target="_blank" rel="noopener noreferrer"
              className="rounded-xl bg-[#242321] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3A3835]">
              Rellenar la evaluación
            </a>
            <span className="text-[11px] text-[#77736B]">Disponible desde el {shortEvalDate(e.dueOn)}.</span>
          </div>
          <p className="text-[11px] text-[#77736B]">
            Cuando su informe esté listo os avisaremos y lo veréis en la pestaña{" "}
            {onOpenReports ? <button type="button" onClick={onOpenReports} className="font-semibold underline">«Informes»</button> : <strong>«Informes»</strong>}, junto a los anteriores, para ir viendo su evolución.
          </p>
        </section>
      ))}
    </div>
  );
}
