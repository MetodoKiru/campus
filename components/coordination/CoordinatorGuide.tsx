"use client";

import { useState } from "react";
import { BookOpenCheck } from "lucide-react";

/** Sube este número cuando cambie algo importante de la guía: se volverá a pedir el compromiso. */
export const COORDINATOR_GUIDE_VERSION = 1;
export const COORDINATOR_GUIDE_DOC = "guia_coordinador";

const CALENDAR: [string, string, string][] = [
  ["Cada lunes", "Revisar las notas de SkillCoins de la semana pasada y las justificaciones por valorar", "«Supervisión»"],
  ["Tras las llamadas de las semanas 1 y 4", "Valorar al mentor del 1 al 5", "«Llamadas»"],
  ["Del 1 al 5 de cada mes", "Rellenar la ficha de Cálculalo del mes anterior de cada alumno", "«Seguimiento», eligiendo el mes"],
  ["Cuando llega una evidencia", "Validarla o pedir una aclaración, en 2 días laborables", "«Seguimiento» → «Evidencias por revisar»"],
  ["Cuando veas un registro mal hecho", "Marcar «Error en el registro»", "«Seguimiento»"],
  ["Cuando una evidencia no se puede hacer", "Proponer una exención con su causa (la aprueba Administración)", "«Seguimiento»"],
  ["Al empezar con un alumno, si lo decides", "Marcar qué herramientas (inglés, lengua, tarjetas) son obligatorias", "«Seguimiento»"],
];

const REMINDERS: [string, string][] = [
  ["Repaso semanal de Supervisión", "Cada lunes"],
  ["Fichas de Cálculalo que faltan", "Día 1 de cada mes; el día 5, si aún falta alguna"],
  ["Evidencia por revisar", "A los 2 días laborables de enviarla el mentor"],
  ["Evidencia sin entregar tras 3 recordatorios al mentor", "Al cumplirse el tercero"],
  ["Valora al mentor tras la llamada", "Después de cada llamada de las semanas 1 y 4; otra vez a los 3 días"],
  ["Justificación por valorar y respuesta a un error marcado", "Cuando contesta el mentor"],
];

/** Guía de la función del coordinador. Con `onAccept`, pide el compromiso al final. */
export default function CoordinatorGuide({ onAccept, acceptedAt }: { onAccept?: () => Promise<void> | void; acceptedAt?: string | null }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <article className="space-y-6 text-sm text-slate-700">
      <header className="flex items-start gap-3">
        <BookOpenCheck className="mt-1 h-6 w-6 shrink-0 text-[#6B5A3E]" />
        <div>
          <h2 className="font-serif text-2xl font-bold text-[#292825]">Tu función como coordinador</h2>
          <p className="text-xs text-slate-500">Qué hacer, cuándo y dónde. El campus te recuerda cada tarea.</p>
        </div>
      </header>

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Qué es y desde cuándo cuenta</h3>
        <p>El campus mide cada noche cómo trabaja cada mentor. Una parte de los datos la pones tú: la ficha de Cálculalo, la revisión de evidencias, los errores en registros y la valoración tras las llamadas. Sin esos datos, el indicador queda «pendiente».</p>
        <p>Los datos cuentan desde el 1 de enero de 2027. <strong>Nunca ves las puntuaciones de los mentores</strong>: solo las tareas que te tocan.</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Calendario</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">Cuándo</th><th className="p-2">Qué hacer</th><th className="p-2">Dónde</th></tr></thead>
            <tbody>
              {CALENDAR.map(([when, what, where]) => (
                <tr key={when} className="border-t border-slate-100 align-top"><td className="p-2 font-semibold text-slate-800">{when}</td><td className="p-2">{what}</td><td className="p-2 text-slate-500">{where}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Cómo se hace</h3>
        <p><strong>Ficha de Cálculalo.</strong> En «Seguimiento», elige el mes. En cada alumno, marca las semanas en las que usó Cálculalo 4 días o más y si el mentor preparó actividades. La calidad y la nota son opcionales.</p>
        <p><strong>Evidencias.</strong> «Descubrirme» lleva al menos 3 fotos (sin la cara del alumno) y una línea de lo trabajado; la misión, una foto o una descripción. Valídala si cumple, pide una aclaración si falta algo (el mentor tiene 2 días laborables) o propón una exención si no se pudo hacer.</p>
        <p><strong>Error en un registro.</strong> Pulsa «Error en el registro» y elige el tipo. El mentor contesta en 2 días laborables desde «Justificaciones».</p>
        <p><strong>Valoración tras las llamadas.</strong> En las semanas 1 y 4, valora al mentor del 1 al 5 en preparación, participación, comunicación, seguimiento y actitud.</p>
        <p><strong>Supervisión.</strong> Revisa las notas de SkillCoins y las marcadas «para revisar». Puedes pedir una justificación con plazo, valorarla (A, B o C) y poner avisos metodológicos.</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Recordatorios que te llegan</h3>
        <p className="text-xs text-slate-500">En la campanita del campus y por correo, juntos en el resumen de las 19:00.</p>
        <ul className="space-y-1">
          {REMINDERS.map(([what, when]) => <li key={what}><span className="font-semibold text-slate-800">{what}:</span> {when}.</li>)}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Lo que no te toca</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Aprobar incidencias, gravedad, alegaciones, incentivos o exenciones: las decide Administración.</li>
          <li>Tocar pagos o el extra de 10 €.</li>
          <li>Corregir notas de SkillCoins o registros: marcas el error y lo corrige quien corresponde.</li>
        </ul>
      </section>

      {onAccept && (
        <footer className="space-y-3 rounded-2xl border border-[#E7E3DC] bg-[#FDFBF7] p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span className="font-semibold text-[#292825]">He leído la guía y me comprometo a cumplir esta función como coordinador.</span>
          </label>
          <button disabled={!checked || busy}
            onClick={async () => { setBusy(true); try { await onAccept(); } finally { setBusy(false); } }}
            className="rounded-xl bg-[#6B5A3E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#5A4B33] disabled:opacity-50">
            {busy ? "Guardando…" : "Aceptar y entrar"}
          </button>
        </footer>
      )}
      {!onAccept && acceptedAt && (
        <p className="text-xs text-emerald-700">Aceptaste esta guía el {new Date(acceptedAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}.</p>
      )}
    </article>
  );
}
