"use client";

import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { btnDark, btnLight, card, input, subtle } from "@/components/classes/shared";
import {
  ACADEMIC_LABEL, MODE_LABEL, STATUS_LABEL, TARGET_LABEL, cycleLabel, madridTodayIso, mentorWindow, shortEvalDate,
  type EvalMode, type StaffEvaluationView, type StaffEvaluationsPayload, type StaffStudentSettings,
} from "@/lib/evaluations";
import { evalAction, openEvalFile, uploadEvalFile, useEvaluations } from "./api";

type Notify = (text: string, type: "success" | "error") => void;

const STATUS_STYLE: Record<string, string> = {
  programada: "bg-[#F3F0EA] text-[#555149]",
  abierta: "bg-[#FBF3E2] text-[#7A5B1E]",
  completada: "bg-[#E9F3EA] text-[#2F6B3A]",
  sin_respuesta: "bg-[#F8E5E3] text-[#8A2F25]",
  cancelada: "bg-[#F3F0EA] text-[#77736B]",
};

/**
 * Pestaña «Evaluaciones» de coordinación y administración: quién ha respondido y
 * quién falta, la evaluación en papel (aprobar la prueba académica, ver el
 * escaneo), mover fechas y, para administración, encender el sistema.
 */
export default function StaffEvaluations({ notify }: { notify: Notify }) {
  const { data, error, reload } = useEvaluations<StaffEvaluationsPayload>();
  const [view, setView] = useState<"pendientes" | "todas">("pendientes");
  const [openId, setOpenId] = useState<string | null>(null);
  if (error) return <p className="text-xs text-[#8A2F25]">{error}</p>;
  if (!data) return <p className="text-xs text-[#77736B]">Cargando…</p>;
  const rows = data.rows.filter((r) => view === "todas" || r.status === "abierta" || r.status === "sin_respuesta"
    || (r.target === "alumno" && r.academicStatus === "por_aprobar") || r.status === "programada");
  const byStudent = new Map<string, StaffEvaluationView[]>();
  for (const r of rows) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);

  const act = async (body: Record<string, unknown>, ok: string) => {
    const { error } = await evalAction(body);
    notify(error ?? ok, error ? "error" : "success");
    if (!error) await reload();
  };

  return (
    <div className="space-y-5">
      <section className={`${card} space-y-2`}>
        <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]"><ClipboardList className="h-5 w-5" /> Evaluaciones trimestrales</h2>
        <p className="text-xs text-[#6D6962]">
          Familia: el primer día de clase y cada 3 meses. Mentor: 4 semanas después de su primera clase y cada 3 meses, solo 5 días de plazo.
          Papel del alumno: en las primeras sesiones y después la semana antes del formulario del mentor. Los avisos y correos salen solos.
        </p>
      </section>

      {data.settings && <AdminSettings settings={data.settings} students={data.allStudents} act={act} notify={notify} />}

      <div className="flex gap-2">
        <button type="button" className={view === "pendientes" ? btnDark : btnLight} onClick={() => setView("pendientes")}>Pendientes y próximas</button>
        <button type="button" className={view === "todas" ? btnDark : btnLight} onClick={() => setView("todas")}>Todas (últimos 4 meses)</button>
      </div>

      {byStudent.size === 0 ? (
        <p className={`${subtle} text-xs text-[#6D6962]`}>
          {data.settings?.mode === "apagado" ? "El sistema está apagado: no se crea ninguna evaluación." : "No hay evaluaciones pendientes ahora mismo."}
        </p>
      ) : [...byStudent.entries()].map(([sid, list]) => (
        <section key={sid} className={`${card} space-y-2`}>
          <h3 className="text-sm font-bold text-[#292825]">{list[0].studentName}</h3>
          <ul className="space-y-2">
            {list.map((r) => (
              <li key={r.id} className={subtle}>
                <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left text-xs" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                  <span>
                    <strong>{TARGET_LABEL[r.target]}</strong> · {cycleLabel(r.cycle)}
                    {r.mentorName && <> · {r.mentorName}</>}
                    {" · "}{dateText(r)}
                    {r.holiday && <span className="ml-1 text-[#7A5B1E]">({r.holiday})</span>}
                  </span>
                  <span className="flex items-center gap-1">
                    {r.target === "alumno" && r.status !== "completada" && <span className="rounded-full bg-[#F3F0EA] px-2 py-0.5 text-[10px]">Académica: {ACADEMIC_LABEL[r.academicStatus]}</span>}
                    {r.late && <span className="rounded-full bg-[#F8E5E3] px-2 py-0.5 text-[10px] text-[#8A2F25]">Fuera de plazo</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </span>
                </button>
                {openId === r.id && <RowDetail r={r} act={act} notify={notify} reload={reload} />}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <StudentSettings students={data.students} act={act} />
    </div>
  );
}

function dateText(r: StaffEvaluationView) {
  if (r.target === "mentor") {
    const w = mentorWindow(r.dueOn);
    return `del ${shortEvalDate(w.opensOn)} al ${shortEvalDate(w.closesOn)}`;
  }
  return r.target === "alumno" && r.cycle === 0 ? `escaneo antes del ${shortEvalDate(r.dueOn)}` : shortEvalDate(r.dueOn);
}

function RowDetail({ r, act, notify, reload }: {
  r: StaffEvaluationView; act: (b: Record<string, unknown>, ok: string) => Promise<void>; notify: Notify; reload: () => Promise<void>;
}) {
  const [due, setDue] = useState(r.dueOn);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [givenBy, setGivenBy] = useState("");
  const open = async (which: string, index?: number) => {
    const err = await openEvalFile({ accion: "descargar", evaluationId: r.id, which, index });
    if (err) notify(err, "error");
  };
  const uploadAcademic = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const up = await uploadEvalFile(file, { accion: "subir", evaluationId: r.id, which: "academica" });
    if (up.error || !up.path) { setBusy(false); notify(up.error ?? "No se pudo subir.", "error"); return; }
    await act({ accion: "academica_confirmar", evaluationId: r.id, path: up.path, name: file.name.replace(/\.pdf$/i, "") }, "Prueba académica subida y aprobada.");
    setBusy(false);
  };
  const uploadScan = async () => {
    if (!files.length) return;
    setBusy(true);
    const paths: string[] = [];
    for (const f of files) {
      const up = await uploadEvalFile(f, { accion: "subir", evaluationId: r.id, which: "escaneo" });
      if (up.error || !up.path) { setBusy(false); notify(up.error ?? "No se pudo subir.", "error"); return; }
      paths.push(up.path);
    }
    await act({ accion: "escaneo_confirmar", evaluationId: r.id, paths, givenBy: givenBy.trim() || "Subido por coordinación" }, "Escaneo subido.");
    setFiles([]);
    setBusy(false);
  };
  const today = madridTodayIso();

  return (
    <div className="mt-3 space-y-3 border-t border-[#E7E3DC] pt-3 text-xs text-[#45433F]">
      {r.completedAt && <p>Hecha el {new Date(r.completedAt).toLocaleDateString("es-ES")} {r.completedVia === "formulario" ? "(formulario)" : r.completedVia === "escaneo" ? "(escaneo subido)" : "(marcada a mano)"}.</p>}
      {r.dueOn !== r.originalDueOn && <p>Fecha original: {shortEvalDate(r.originalDueOn)}.</p>}
      {r.note && <p className="text-[#6D6962]">Nota: {r.note}</p>}

      {r.target === "alumno" && (
        <div className="space-y-2">
          <p><strong>Prueba académica:</strong> {ACADEMIC_LABEL[r.academicStatus]}{r.academicName && ` · ${r.academicName}`}{r.academicByName && ` · subida por ${r.academicByName}`}</p>
          <div className="flex flex-wrap gap-2">
            {r.academicStatus !== "sin_elegir" && <button type="button" className={btnLight} onClick={() => open("academica")}>Ver la prueba</button>}
            {r.academicStatus === "por_aprobar" && <>
              <button type="button" className={btnDark} onClick={() => act({ accion: "academica_revisar", evaluationId: r.id, aprobar: true }, "Aprobada. El mentor ya puede imprimirla.")}>Aprobar</button>
              <button type="button" className={btnLight} onClick={() => {
                const motivo = window.prompt("¿Por qué hace falta otra prueba? (se lo diremos al mentor)") ?? "";
                void act({ accion: "academica_revisar", evaluationId: r.id, aprobar: false, motivo }, "Pedida otra prueba al mentor.");
              }}>Pedir otra</button>
            </>}
          </div>
          {r.status !== "completada" && (
            <label className="block">
              <span className="text-[#6D6962]">{r.academicStatus === "sin_elegir" ? "Subir la prueba de Calcúlalo (PDF):" : "Sustituirla por otra (PDF):"}</span>
              <input type="file" accept="application/pdf" disabled={busy} className={`${input} mt-1`} onChange={(ev) => void uploadAcademic(ev.target.files?.[0])} />
            </label>
          )}
          <p><strong>Escaneo:</strong> {r.scans ? `${r.scans} ${r.scans === 1 ? "archivo" : "archivos"}${r.givenBy ? ` · ${r.givenBy}` : ""}` : "aún no subido"}</p>
          {r.scans > 0 && (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: r.scans }, (_, i) => <button key={i} type="button" className={btnLight} onClick={() => open("escaneo", i)}>Ver {i + 1}</button>)}
            </div>
          )}
          <div className="space-y-1">
            <span className="text-[#6D6962]">Subirlo desde aquí (por ejemplo, si la pasó un sustituto):</span>
            <input type="file" multiple accept="application/pdf,image/*" disabled={busy} className={input} onChange={(ev) => setFiles(Array.from(ev.target.files ?? []))} />
            <div className="flex flex-wrap gap-2">
              <input className={`${input} w-56`} placeholder="Quién se la pasó (opcional)" value={givenBy} onChange={(ev) => setGivenBy(ev.target.value)} />
              <button type="button" className={btnDark} disabled={busy || !files.length} onClick={() => void uploadScan()}>{busy ? "Subiendo…" : "Subir escaneo"}</button>
            </div>
          </div>
        </div>
      )}

      {r.status !== "completada" && r.status !== "cancelada" && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className={`${input} w-40`} value={due} min={today} onChange={(ev) => setDue(ev.target.value)} />
          <button type="button" className={btnLight} disabled={!due || due === r.dueOn} onClick={() => act({ accion: "mover", evaluationId: r.id, dueOn: due }, "Fecha cambiada. Los avisos saldrán con la fecha nueva.")}>
            {r.status === "sin_respuesta" ? "Abrir otro plazo" : "Cambiar fecha"}
          </button>
          {r.target !== "alumno" && (
            <button type="button" className={btnLight} onClick={() => {
              const note = window.prompt("¿Cómo se ha hecho? (por ejemplo, «por teléfono»)") ?? "";
              void act({ accion: "completar", evaluationId: r.id, note }, "Marcada como hecha.");
            }}>Marcar como hecha</button>
          )}
          <button type="button" className={btnLight} onClick={() => {
            if (!window.confirm("¿Cancelar esta evaluación? No saldrán más avisos.")) return;
            void act({ accion: "cancelar", evaluationId: r.id }, "Evaluación cancelada.");
          }}>Cancelar</button>
        </div>
      )}
      <button type="button" className="text-[11px] underline text-[#77736B]" onClick={() => void reload()}>Actualizar</button>
    </div>
  );
}

function AdminSettings({ settings, students, act, notify }: {
  settings: NonNullable<StaffEvaluationsPayload["settings"]>; students: { id: string; name: string }[];
  act: (b: Record<string, unknown>, ok: string) => Promise<void>; notify: Notify;
}) {
  const [mode, setMode] = useState<EvalMode>(settings.mode);
  const [tests, setTests] = useState<string[]>(settings.testStudents);
  const [busy, setBusy] = useState(false);
  const uploadFixed = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf") { notify("El test tiene que ser un PDF.", "error"); return; }
    setBusy(true);
    const { error, data } = await evalAction({ accion: "test_fijo_subir" });
    if (error) { setBusy(false); notify(error, "error"); return; }
    const { supabase } = await import("@/lib/supabase");
    const up = await supabase.storage.from("kiru-evaluaciones").uploadToSignedUrl(String(data.path), String(data.token), file, { contentType: "application/pdf" });
    if (up.error) { setBusy(false); notify("No se pudo subir el test.", "error"); return; }
    await act({ accion: "test_fijo_confirmar", path: data.path }, "Test fijo guardado. Es el mismo para todos los alumnos.");
    setBusy(false);
  };
  return (
    <section className={`${card} space-y-3`}>
      <h3 className="text-sm font-bold text-[#292825]">Ajustes (solo administración)</h3>
      <div className="space-y-1 text-xs">
        {(Object.keys(MODE_LABEL) as EvalMode[]).map((m) => (
          <label key={m} className="flex items-center gap-2"><input type="radio" checked={mode === m} onChange={() => setMode(m)} /> {MODE_LABEL[m]}</label>
        ))}
      </div>
      {mode === "prueba" && (
        <div className="space-y-1 text-xs">
          <p className="text-[#6D6962]">Alumnos de la prueba:</p>
          <div className="flex flex-wrap gap-3">
            {students.map((s) => (
              <label key={s.id} className="flex items-center gap-1">
                <input type="checkbox" checked={tests.includes(s.id)} onChange={(ev) => setTests(ev.target.checked ? [...tests, s.id] : tests.filter((x) => x !== s.id))} /> {s.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <button type="button" className={btnDark} onClick={() => act({ accion: "ajustes", modo: mode, alumnosPrueba: tests }, "Ajustes guardados. Se aplican en la próxima revisión diaria (8:00).")}>Guardar ajustes</button>
      <div className="space-y-1 border-t border-[#E7E3DC] pt-3 text-xs">
        <p><strong>Test fijo del alumno</strong> (el mismo para todos): {settings.hasFixedTest ? "subido" : "aún no subido"}</p>
        <div className="flex flex-wrap items-center gap-2">
          {settings.hasFixedTest && <button type="button" className={btnLight} onClick={async () => { const e = await openEvalFile({ accion: "test_fijo_ver" }); if (e) notify(e, "error"); }}>Ver</button>}
          <input type="file" accept="application/pdf" disabled={busy} className={`${input} w-auto`} onChange={(ev) => void uploadFixed(ev.target.files?.[0])} />
        </div>
      </div>
    </section>
  );
}

function StudentSettings({ students, act }: { students: StaffStudentSettings[]; act: (b: Record<string, unknown>, ok: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`${card} space-y-3`}>
      <button type="button" className="text-sm font-bold text-[#292825]" onClick={() => setOpen(!open)}>{open ? "▾" : "▸"} Fechas de inicio por alumno</button>
      {open && (
        <>
          <p className="text-xs text-[#6D6962]">
            Si no pones nada, el inicio de la familia es su primera sesión registrada. Marca «sin inicial» en alumnos que ya llevaban tiempo cuando empezó el sistema.
          </p>
          <ul className="space-y-2">{students.map((s) => <StudentRow key={s.studentId} s={s} act={act} />)}</ul>
        </>
      )}
    </section>
  );
}

function StudentRow({ s, act }: { s: StaffStudentSettings; act: (b: Record<string, unknown>, ok: string) => Promise<void> }) {
  const [start, setStart] = useState(s.familyStartOn ?? "");
  const [skip, setSkip] = useState(s.skipInitial);
  const [paused, setPaused] = useState(s.paused);
  return (
    <li className={`${subtle} flex flex-wrap items-center gap-3 text-xs`}>
      <strong className="w-32">{s.studentName}</strong>
      <span className="text-[#6D6962]">1.ª sesión: {s.firstSession ? shortEvalDate(s.firstSession) : "—"}</span>
      <label className="flex items-center gap-1">Inicio <input type="date" className={`${input} w-36`} value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label className="flex items-center gap-1"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Sin inicial</label>
      <label className="flex items-center gap-1"><input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> En pausa</label>
      <button type="button" className={btnLight} onClick={() => act({ accion: "alumno_ajustes", studentId: s.studentId, familyStartOn: start || null, skipInitial: skip, paused }, "Guardado.")}>Guardar</button>
    </li>
  );
}
