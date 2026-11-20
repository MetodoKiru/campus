"use client";

import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { btnDark, btnLight, card, input, subtle } from "@/components/classes/shared";
import { ACADEMIC_LABEL, cycleLabel, shortEvalDate, type MentorEvaluationView } from "@/lib/evaluations";
import { evalAction, openEvalFile, uploadEvalFile, useEvaluations } from "./api";

type Notify = (text: string) => void;

/**
 * Evaluaciones del mentor en su panel: la evaluación en papel de sus alumnos
 * (imprimir el test y la prueba académica, subir el escaneo) y su propio
 * formulario, que solo se abre 5 días.
 */
export default function MentorEvaluations({ notify }: { notify: Notify }) {
  const { data, reload } = useEvaluations<{ evaluations: MentorEvaluationView[] }>();
  const items = data?.evaluations ?? [];
  if (!items.length) return null;
  return (
    <section className={`${card} space-y-3`} aria-label="Evaluaciones">
      <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]"><ClipboardList className="h-5 w-5" /> Evaluaciones de tus alumnos</h3>
      <p className="text-xs text-[#6D6962]">
        Cada 3 meses: primero el alumno hace la evaluación en papel en clase (sin ayuda) y unos días después rellenas tu formulario con lo que has observado en las últimas 4 semanas.
      </p>
      <ul className="space-y-3">
        {items.map((e) => (
          <li key={e.id} className={`${subtle} space-y-2`}>
            {e.target === "alumno" ? <PaperItem e={e} notify={notify} reload={reload} /> : <FormItem e={e} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FormItem({ e }: { e: MentorEvaluationView }) {
  return (
    <div className="space-y-1 text-xs text-[#45433F]">
      <p className="font-semibold text-[#292825]">Tu formulario · {e.studentName} · {cycleLabel(e.cycle)}</p>
      {e.status === "completada" ? <p>Hecho. ¡Gracias!</p>
        : e.status === "sin_respuesta" ? <p>El plazo terminó el {shortEvalDate(e.closesOn!)}. Si necesitas rellenarlo, pide a tu coordinador que te abra otro plazo.</p>
        : e.link ? (
          <div className="flex flex-wrap items-center gap-3">
            <a href={e.link} target="_blank" rel="noopener noreferrer" className={btnDark}>Rellenar mi evaluación</a>
            <span>Abierto hasta el <strong>{shortEvalDate(e.closesOn!, true)}</strong>.</span>
          </div>
        ) : <p>Se abre el <strong>{shortEvalDate(e.opensOn!, true)}</strong> y se puede rellenar hasta el {shortEvalDate(e.closesOn!, true)} (solo esos 5 días).</p>}
    </div>
  );
}

function PaperItem({ e, notify, reload }: { e: MentorEvaluationView; notify: Notify; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [who, setWho] = useState<"yo" | "sustituto">("yo");
  const [substitute, setSubstitute] = useState("");
  const open = async (which: "academica" | "test_fijo") => {
    const err = await openEvalFile({ accion: "descargar", evaluationId: e.id, which });
    if (err) notify(err);
  };
  const uploadAcademic = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const up = await uploadEvalFile(file, { accion: "subir", evaluationId: e.id, which: "academica" });
    if (up.error || !up.path) { setBusy(false); notify(up.error ?? "No se pudo subir."); return; }
    const { error } = await evalAction({ accion: "academica_confirmar", evaluationId: e.id, path: up.path, name: file.name.replace(/\.pdf$/i, "") });
    setBusy(false);
    notify(error ?? "Prueba académica subida. Coordinación la aprobará antes de que puedas imprimirla.");
    await reload();
  };
  const uploadScan = async () => {
    if (!files.length) { notify("Selecciona el escaneo (PDF o fotos)."); return; }
    if (who === "sustituto" && !substitute.trim()) { notify("Selecciona quién se la pasó: escribe el nombre del sustituto."); return; }
    setBusy(true);
    const paths: string[] = [];
    for (const f of files) {
      const up = await uploadEvalFile(f, { accion: "subir", evaluationId: e.id, which: "escaneo" });
      if (up.error || !up.path) { setBusy(false); notify(up.error ?? "No se pudo subir."); return; }
      paths.push(up.path);
    }
    const { error } = await evalAction({
      accion: "escaneo_confirmar", evaluationId: e.id, paths, givenBy: who === "yo" ? "Mentor habitual" : `Sustituto: ${substitute.trim()}`,
    });
    setBusy(false);
    setFiles([]);
    notify(error ?? "Escaneo subido. ¡Gracias!");
    await reload();
  };

  return (
    <div className="space-y-2 text-xs text-[#45433F]">
      <p className="font-semibold text-[#292825]">Evaluación en papel · {e.studentName} · {cycleLabel(e.cycle)}</p>
      {e.status === "completada" ? (
        <p>Escaneo subido ({e.scans} {e.scans === 1 ? "archivo" : "archivos"}{e.givenBy ? ` · ${e.givenBy}` : ""}). ¡Gracias!</p>
      ) : (
        <p>
          {e.cycle === 0
            ? <>Pásasela en las primeras sesiones, sin ayudarle. Sube el escaneo antes del <strong>{shortEvalDate(e.dueOn, true)}</strong>.</>
            : <>Pásasela en clase la semana del <strong>{shortEvalDate(e.dueOn, true)}</strong>, sin ayudarle. Luego sube el escaneo.</>}
          {" "}La puede pasar también un sustituto.
        </p>
      )}
      {e.status !== "completada" && (
        <>
          <div className="flex flex-wrap gap-2">
            {e.hasFixedTest ? <button type="button" className={btnLight} onClick={() => open("test_fijo")}>Descargar el test</button>
              : <span className="text-[#77736B]">El test aún no está subido.</span>}
            {e.academicStatus === "aprobada" && <button type="button" className={btnLight} onClick={() => open("academica")}>Descargar la prueba académica</button>}
          </div>
          <p>
            Prueba académica (Calcúlalo): <strong>{ACADEMIC_LABEL[e.academicStatus]}</strong>
            {e.academicName && <> · {e.academicName}</>}
            {e.academicStatus === "por_aprobar" && " · la tiene que aprobar coordinación"}
          </p>
          {e.academicStatus === "sin_elegir" && (
            <label className="block">
              <span className="text-[#6D6962]">Si quieres elegirla tú, sube el PDF de Calcúlalo:</span>
              <input type="file" accept="application/pdf" disabled={busy} className={`${input} mt-1`} onChange={(ev) => void uploadAcademic(ev.target.files?.[0])} />
            </label>
          )}
        </>
      )}
      <div className="space-y-2 border-t border-[#E7E3DC] pt-2">
        <p className="font-semibold">{e.status === "completada" ? "Añadir más páginas" : "Subir el escaneo"}</p>
        <input type="file" multiple accept="application/pdf,image/*" disabled={busy} className={input}
          onChange={(ev) => setFiles(Array.from(ev.target.files ?? []))} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1"><input type="radio" checked={who === "yo"} onChange={() => setWho("yo")} /> Se la pasé yo</label>
          <label className="flex items-center gap-1"><input type="radio" checked={who === "sustituto"} onChange={() => setWho("sustituto")} /> Un sustituto</label>
          {who === "sustituto" && <input className={`${input} w-48`} placeholder="Nombre del sustituto" value={substitute} onChange={(ev) => setSubstitute(ev.target.value)} />}
        </div>
        <button type="button" className={btnDark} disabled={busy || !files.length} onClick={() => void uploadScan()}>{busy ? "Subiendo…" : "Subir escaneo"}</button>
      </div>
    </div>
  );
}
