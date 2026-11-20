"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ClipboardList, FolderOpen, Video } from "lucide-react";
import { previewRole } from "@/lib/preview";
import { onboardingCount, onboardingDone, type FamilyOnboardingKid, type FamilyOnboardingPayload, type OnboardingStepState } from "@/lib/incorporacion";
import { familyApi, useFamilyApi } from "./api";

type Notify = (text: string, type: "success" | "error") => void;

/** Datos de ejemplo para «Ver el campus como una familia». */
function previewKid(studentId: string, name: string): FamilyOnboardingKid {
  return {
    studentId, studentName: name.split(" ")[0] || "vuestro hijo/a",
    calls: { state: "hecho", formUrl: "#" },
    evaluation: { state: "pendiente", link: null, canOpen: true },
    info: { state: "pendiente", formUrl: "#", sentAt: null },
  };
}

/**
 * Primeros pasos de la familia: 3 tarjetas, una detrás de otra, como la incorporación del mentor.
 *   1. Llamada semanal  2. Evaluación inicial (cada 3 meses)  3. Información extra (voluntaria)
 * Con `compact`, cuando ya está todo hecho, queda en una línea que se puede desplegar.
 * Sin `compact`, cuando está todo hecho no se muestra.
 */
export default function FamilyOnboarding({ kids, compact = false, notify }: {
  kids: { id: string; name: string }[];
  compact?: boolean;
  notify: Notify;
}) {
  const { data, reload } = useFamilyApi<FamilyOnboardingPayload>("/api/familias/incorporacion");
  const isPreview = typeof window !== "undefined" && !!previewRole();
  const items = useMemo(() => {
    if (isPreview) return kids.map((k) => previewKid(k.id, k.name));
    return (data?.kids ?? []).filter((k) => kids.some((x) => x.id === k.studentId));
  }, [data, kids, isPreview]);

  if (!items.length) return null;
  const visible = compact ? items : items.filter((k) => !onboardingDone(k));
  if (!visible.length) return null;
  return (
    <div className="space-y-4">
      {visible.map((k) => (
        <Steps key={k.studentId} kid={k} compact={compact} showName={kids.length > 1} notify={notify} reload={reload} preview={isPreview} />
      ))}
    </div>
  );
}

const STEP_TITLES = ["Vuestra llamada semanal", "Evaluación inicial", "Información extra"];

function firstPending(k: FamilyOnboardingKid): number {
  const states = [k.calls.state, k.evaluation.state, k.info.state];
  const i = states.findIndex((s) => s === "pendiente");
  return i < 0 ? 0 : i;
}

function Steps({ kid, compact, showName, notify, reload, preview }: {
  kid: FamilyOnboardingKid; compact: boolean; showName: boolean; notify: Notify; reload: () => Promise<void>; preview: boolean;
}) {
  const done = onboardingDone(kid);
  const [step, setStep] = useState(() => firstPending(kid));
  const [open, setOpen] = useState(!done);
  const [busy, setBusy] = useState(false);
  const states: OnboardingStepState[] = [kid.calls.state, kid.evaluation.state, kid.info.state];
  const count = onboardingCount(kid);

  if (compact && done && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#E7E3DC] bg-white px-4 py-3 text-left text-xs text-[#5F6B47] hover:bg-[#FAF8F5]">
        <span className="flex items-center gap-2 font-semibold"><Check className="h-4 w-4" /> Primeros pasos hechos{showName ? ` · ${kid.studentName}` : ""}</span>
        <span className="text-[11px] text-[#8D887F]">Ver</span>
      </button>
    );
  }

  const act = async (action: string, ok?: string) => {
    if (preview) { notify("Es la vista previa: no se guarda nada.", "success"); return; }
    setBusy(true);
    try { await familyApi("/api/familias/incorporacion", { action, studentId: kid.studentId }); if (ok) notify(ok, "success"); await reload(); }
    catch (e) { notify(e instanceof Error ? e.message : "No se pudo guardar.", "error"); }
    finally { setBusy(false); }
  };

  // La ventana se abre al pulsar (si no, el navegador la bloquea) y luego se le pone el enlace.
  const openEvaluation = async () => {
    if (kid.evaluation.link) { window.open(kid.evaluation.link, "_blank", "noopener"); return; }
    if (preview) { notify("Es la vista previa: aquí se abriría la evaluación.", "success"); return; }
    const win = window.open("", "_blank");
    setBusy(true);
    try {
      const { link } = await familyApi<{ link: string }>("/api/familias/incorporacion", { action: "abrir_evaluacion", studentId: kid.studentId });
      if (win) win.location.href = link; else window.location.href = link;
      await reload();
    } catch (e) {
      win?.close();
      notify(e instanceof Error ? e.message : "No se pudo abrir la evaluación.", "error");
    } finally { setBusy(false); }
  };

  return (
    <section className="space-y-4 rounded-3xl border-2 border-[#E4D8C5] bg-white p-5" aria-label="Primeros pasos">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-bold text-[#292825]">Vuestros primeros pasos{showName ? ` · ${kid.studentName}` : ""}</h3>
          <p className="text-xs text-[#77736B]">{done ? "¡Todo hecho! Gracias." : "Cuanto antes los hagáis, antes empezamos con buen pie."}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#F3EEE5] px-2.5 py-1 text-[11px] font-bold text-[#806C50]">{count} de 3</span>
      </div>

      {/* Los 3 pasos: se puede pulsar cualquiera */}
      <ol className="grid grid-cols-3 gap-2" aria-label="Pasos">
        {STEP_TITLES.map((title, i) => {
          const ok = states[i] === "hecho" || states[i] === "saltado";
          const active = i === step;
          return (
            <li key={title}>
              <button type="button" onClick={() => setStep(i)} aria-current={active ? "step" : undefined}
                className={`flex w-full flex-col items-center gap-1 rounded-xl border px-1.5 py-2 text-center transition ${active ? "border-[#806C50] bg-[#F6F0E6]" : "border-[#E7E3DC] bg-white hover:bg-[#FAF8F5]"}`}>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full font-serif text-xs font-bold ${ok ? "bg-[#5F6B47] text-white" : active ? "bg-[#3F3A33] text-white" : "border border-[#E7E3DC] text-[#45433F]"}`}>
                  {ok ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="text-[10.5px] font-semibold leading-tight text-[#45433F]">{title}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="min-h-[9.5rem] rounded-2xl bg-[#FAF8F5] p-4">
        {step === 0 && (
          <StepBody icon={Video} title="Paso 1 · Vuestra llamada semanal" time="2 minutos" state={kid.calls.state}
            text={<>Cada semana hablamos <b>20 minutos</b> con vosotros para ver cómo va {kid.studentName}. Marcad cuándo os viene bien y buscamos la hora.</>}
            doneText="Hecho. Os llegará un correo con la hora fija.">
            {kid.calls.state === "hecho"
              ? <a href={kid.calls.formUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-[#6D6962] underline">Cambiar nuestros horarios</a>
              : <a href={kid.calls.formUrl} target="_blank" rel="noopener noreferrer" className={primary}>Marcar nuestros horarios</a>}
          </StepBody>
        )}
        {step === 1 && (
          <StepBody icon={ClipboardList} title="Paso 2 · Evaluación inicial" time="5-10 minutos" state={kid.evaluation.state}
            text={<>Contadnos cómo veis a {kid.studentName} en casa. Así sabemos de dónde partimos. <b>Se repite cada 3 meses</b> para ver su evolución.</>}
            doneText="Hecho. Os avisaremos cuando toque la siguiente, dentro de 3 meses."
            waitText="Todavía no está abierta. Os avisaremos por correo.">
            {kid.evaluation.state === "pendiente" && (
              <button type="button" disabled={busy} onClick={openEvaluation} className={primary}>Rellenar la evaluación</button>
            )}
          </StepBody>
        )}
        {step === 2 && (
          <StepBody icon={FolderOpen} title="Paso 3 · Información extra" time="Voluntario, pero recomendado" state={kid.info.state}
            text={<>Si queréis, dadnos el contacto del colegio, del psicólogo… y subid informes, notas o correos que nos ayuden a entender a {kid.studentName}.</>}
            doneText="Recibido, gracias. Si queréis añadir algo más, podéis enviarlo otra vez."
            skippedText="Lo habéis dejado para más adelante. Podéis hacerlo cuando queráis.">
            <div className="flex flex-wrap items-center gap-3">
              <a href={kid.info.formUrl} target="_blank" rel="noopener noreferrer" className={kid.info.state === "pendiente" ? primary : secondary}>
                {kid.info.state === "hecho" ? "Añadir más" : "Añadir información"}
              </a>
              {kid.info.state === "pendiente" && (
                <button type="button" disabled={busy} onClick={() => act("saltar_info", "Perfecto. Lo tenéis aquí si cambiáis de idea.")} className="text-[11px] font-semibold text-[#6D6962] underline">
                  Ahora no
                </button>
              )}
            </div>
          </StepBody>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
          className="inline-flex items-center gap-1 rounded-xl border border-[#E7E3DC] bg-white px-3 py-1.5 text-xs font-semibold text-[#45433F] disabled:opacity-40">
          <ChevronLeft className="h-3.5 w-3.5" /> Anterior
        </button>
        {compact && done && (
          <button type="button" onClick={() => setOpen(false)} className="text-[11px] font-semibold text-[#8D887F] underline">Cerrar</button>
        )}
        <button type="button" onClick={() => setStep((s) => Math.min(2, s + 1))} disabled={step === 2}
          className="inline-flex items-center gap-1 rounded-xl border border-[#E7E3DC] bg-white px-3 py-1.5 text-xs font-semibold text-[#45433F] disabled:opacity-40">
          Siguiente <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}

const primary = "inline-block rounded-xl bg-[#3F3A33] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2C2823] disabled:opacity-50";
const secondary = "inline-block rounded-xl border border-[#E7E3DC] bg-white px-4 py-2 text-xs font-semibold text-[#45433F] hover:bg-[#F3EFE8]";

function StepBody({ icon: Icon, title, time, text, state, doneText, waitText, skippedText, children }: {
  icon: React.ElementType; title: string; time: string; text: React.ReactNode; state: OnboardingStepState;
  doneText: string; waitText?: string; skippedText?: string; children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <h4 className="flex items-center gap-2 text-sm font-bold text-[#292825]"><Icon className="h-4 w-4 shrink-0 text-[#806C50]" /> {title}</h4>
        <p className="pl-6 text-[10.5px] text-[#8D887F]">{time}</p>
      </div>
      <p className="text-xs leading-relaxed text-[#45433F]">{text}</p>
      {state === "hecho" && <p className="flex items-center gap-1.5 text-xs font-semibold text-[#5F6B47]"><Check className="h-3.5 w-3.5" /> {doneText}</p>}
      {state === "saltado" && skippedText && <p className="text-xs text-[#77736B]">{skippedText}</p>}
      {state === "en_espera" && waitText && <p className="text-xs text-[#77736B]">{waitText}</p>}
      {children}
    </div>
  );
}
