"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  OFFER_RESPONSE_LABEL,
  STATUS_LABEL,
  STEPS,
  type MentorOffer,
  type MentorPanelData,
  type OfferResponse,
  type StepId,
  type StepStatus,
} from "@/lib/mentor-steps";

const MAX_CERTIFICATE_BYTES = 4 * 1024 * 1024;

async function call<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Tu sesión ha caducado. Vuelve a entrar.");
  const isFile = init?.body instanceof FormData;
  const response = await fetch(path, {
    method: init?.method ?? "GET",
    headers: isFile ? { Authorization: `Bearer ${session.access_token}` } : { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: init ? (isFile ? (init.body as FormData) : JSON.stringify(init.body)) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "No se pudo completar la acción.");
  return json as T;
}

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

const STATUS_STYLE: Record<StepStatus, string> = {
  pendiente: "bg-[#FAF8F5] text-[#77736B] border-[#E7E3DC]",
  en_curso: "bg-[#F3EEE5] text-[#806C50] border-[#E4D8C5]",
  enviado: "bg-[#F3EEE5] text-[#806C50] border-[#E4D8C5]",
  en_revision: "bg-[#F3EEE5] text-[#806C50] border-[#E4D8C5]",
  completado: "bg-[#242321] text-white border-[#242321]",
  requiere_correccion: "bg-white text-[#9A4B3F] border-[#D9B3AA]",
};

export function StatusChip({ status }: { status: StepStatus }) {
  return (
    <span className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Carga el progreso real del mentor. La usan el menú ☰ y la vista de cada paso. */
export function useMentorPanel() {
  const [data, setData] = useState<MentorPanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try { setData(await call<MentorPanelData>("/api/mentor/panel")); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar tu progreso."); }
  }, []);
  useEffect(() => {
    let alive = true;
    call<MentorPanelData>("/api/mentor/panel")
      .then((result) => { if (alive) setData(result); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "No se pudo cargar tu progreso."); });
    return () => { alive = false; };
  }, []);
  return { data, error, reload };
}

/** Desplegable del icono ☰: los cuatro pasos con su estado. */
export function MentorMenu({ data, active, onSelect, onClose }: {
  data: MentorPanelData | null;
  active: StepId | null;
  onSelect: (step: StepId | null) => void;
  onClose: () => void;
}) {
  const done = data ? STEPS.filter((s) => s.id !== "asignacion" && data.steps[s.id].status === "completado").length : 0;
  return (
    <>
      <button type="button" aria-label="Cerrar menú" onClick={onClose} className="fixed inset-0 z-30 cursor-default bg-black/10" />
      <nav aria-label="Mis pasos como mentor" className="absolute left-0 top-full z-40 mt-2 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-[#E7E3DC] bg-white p-2 shadow-lg">
        <div className="px-3 pb-2 pt-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">Mi incorporación</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F3F0EA]" aria-hidden>
            <div className="h-full rounded-full bg-[#806C50] transition-all" style={{ width: `${(done / 3) * 100}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-[#77736B]">{data ? `${done} de 3 pasos completados` : "Cargando…"}</p>
        </div>
        <ul className="space-y-1">
          {STEPS.map((step) => {
            const info = data?.steps[step.id];
            const isNew = step.id === "asignacion" && Boolean(data?.offers.some((o) => !o.response));
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => onSelect(step.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${active === step.id ? "bg-[#F3EEE5]" : "hover:bg-[#FAF8F5]"}`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E7E3DC] font-serif text-xs font-bold text-[#45433F]">{step.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-[#292825]">{step.title}</span>
                    {isNew && <span className="block text-[11px] font-semibold text-[#806C50]">{info?.note}</span>}
                  </span>
                  {info && step.id !== "asignacion" && <StatusChip status={info.status} />}
                  {isNew && <span className="h-2 w-2 shrink-0 rounded-full bg-[#806C50]" aria-label="Propuesta nueva" />}
                </button>
              </li>
            );
          })}
        </ul>
        {active && (
          <button type="button" onClick={() => onSelect(null)} className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-[#6D6962] hover:bg-[#FAF8F5]">
            Volver a mi panel de alumnos
          </button>
        )}
      </nav>
    </>
  );
}

function Section({ number, title, status, children }: { number: number; title: string; status?: StepStatus; children: React.ReactNode }) {
  return (
    <section className="space-y-5 rounded-3xl border border-[#E7E3DC] bg-white p-6 shadow-xs sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#806C50]">Paso {number}</span>
          <h2 className="mt-0.5 font-serif text-xl font-bold text-[#292825]">{title}</h2>
        </div>
        {status && <StatusChip status={status} />}
      </div>
      {children}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#555149]">{title}</h3>
      <div className="space-y-1.5 text-sm leading-relaxed text-[#45433F]">{children}</div>
    </div>
  );
}

const primaryButton = "inline-flex items-center gap-1.5 rounded-xl bg-[#242321] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#3A3835] disabled:opacity-50";
const secondaryButton = "inline-flex items-center gap-1.5 rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] px-4 py-2.5 text-xs font-bold text-[#45433F] transition hover:bg-[#F3F0EA] disabled:opacity-50";

/** Vista de cada uno de los cuatro pasos. */
export function MentorStepView({ step, data, reload, notify }: {
  step: StepId;
  data: MentorPanelData;
  reload: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [redo, setRedo] = useState(false);
  const info = data.steps[step];

  const confirmStep = async (id: "nuestro_equipo" | "llamadas", message: string) => {
    setBusy(true);
    try { await call("/api/mentor/panel", { method: "POST", body: { step: id } }); await reload(); notify(message); }
    catch (e) { notify(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  };

  if (step === "certificado") {
    return (
      <Section number={1} title="Certificado de delitos de naturaleza sexual" status={info.status}>
        <Block title="Qué es">
          <p>Es un documento oficial del Ministerio de Justicia que indica si una persona tiene o no antecedentes por delitos de naturaleza sexual. Lo emite el Registro Central de Delincuentes Sexuales.</p>
        </Block>
        <Block title="Por qué lo pide Método Kiru">
          <p>La ley obliga a presentarlo a cualquier persona que vaya a trabajar o colaborar en contacto habitual con menores. Sin él no se te puede asignar ningún alumno.</p>
        </Block>
        <Block title="Cómo y dónde se solicita">
          <p>Es gratuito. Lo más rápido es pedirlo online en la sede electrónica del Ministerio de Justicia, identificándote con Cl@ve, certificado digital o DNI electrónico: lo descargas al momento en PDF.</p>
          <p>Si no puedes hacerlo online, también se puede pedir con cita previa en las Gerencias Territoriales del Ministerio de Justicia.</p>
          <a href="https://sede.mjusticia.gob.es/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#806C50] underline underline-offset-2">
            Sede electrónica del Ministerio de Justicia <ExternalLink className="h-3 w-3" />
          </a>
        </Block>
        <Block title="Qué hacer cuando lo tengas">
          <p>Guarda el PDF original tal como te lo descarga el Ministerio (no una foto ni una captura) y súbelo aquí abajo. Después lo revisamos y aquí verás su estado.</p>
        </Block>
        <div className="space-y-3 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4">
          <p className="text-xs text-[#555149]">
            {info.status === "completado"
              ? `Tu certificado está comprobado${info.date ? ` desde el ${formatDate(info.date)}` : ""}. No tienes que hacer nada más.`
              : info.status === "requiere_correccion"
                ? `Tenemos que pedirte que lo vuelvas a entregar.${info.note ? ` Motivo: ${info.note}` : ""}`
                : info.status === "pendiente"
                  ? "Todavía no nos has entregado el certificado."
                  : `Lo recibimos${info.date ? ` el ${formatDate(info.date)}` : ""} y está pendiente de revisión.`}
          </p>
          {data.certificate.holderName && info.status !== "pendiente" && (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
              <dt className="font-semibold text-[#77736B]">Nombre indicado</dt>
              <dd className="text-[#292825]">{data.certificate.holderName}</dd>
              {info.date && <><dt className="font-semibold text-[#77736B]">{info.status === "enviado" ? "Fecha de entrega" : "Última revisión"}</dt><dd className="text-[#292825]">{formatDate(info.date)}</dd></>}
            </dl>
          )}
          {info.status !== "completado" && (info.status === "enviado" || info.status === "en_revision") && !redo ? (
            <button type="button" onClick={() => setRedo(true)} className="text-xs font-semibold text-[#806C50] underline underline-offset-2">
              ¿Te has equivocado de archivo? Entregarlo otra vez
            </button>
          ) : info.status !== "completado" && (
            <CertificateUpload
              defaultName={data.certificate.holderName || data.mentorName}
              hasPrevious={data.certificate.hasDocument}
              reload={async () => { await reload(); setRedo(false); }}
              notify={notify}
            />
          )}
        </div>
      </Section>
    );
  }

  if (step === "nuestro_equipo") {
    return (
      <Section number={2} title="Nuestro Equipo" status={info.status}>
        <Block title="Para qué sirve">
          <p>Con este formulario preparamos tu perfil en la web de Método Kiru, en la página «Nuestro equipo», para que las familias puedan conocerte y elegirte.</p>
          <p>Rellénalo una sola vez, con el mismo nombre y apellidos de tu cuenta del campus. Cuando lo envíes, aparecerá aquí como «Enviado» en menos de una hora; si no, pulsa «Ya lo he enviado». Revisaremos tu perfil antes de publicarlo.</p>
        </Block>
        {info.status === "requiere_correccion" && (
          <p className="rounded-2xl border border-[#D9B3AA] bg-white p-4 text-xs text-[#9A4B3F]">Necesitamos que lo revises y lo envíes otra vez.{info.note ? ` Motivo: ${info.note}` : ""}</p>
        )}
        {(info.status === "enviado" || info.status === "en_revision") && (
          <p className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 text-xs text-[#555149]">Nos dijiste que lo enviaste{info.date ? ` el ${formatDate(info.date)}` : ""}. Está pendiente de revisión.</p>
        )}
        {info.status === "completado" && (
          <p className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 text-xs text-[#555149]">Tu perfil está revisado{info.date ? ` desde el ${formatDate(info.date)}` : ""}.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <a href={data.teamFormUrl} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
            Abrir el formulario «Nuestro Equipo» <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {info.status !== "completado" && info.status !== "enviado" && info.status !== "en_revision" && (
            <button type="button" disabled={busy} onClick={() => confirmStep("nuestro_equipo", "Anotado: lo revisaremos y te avisaremos aquí.")} className={primaryButton}>
              Ya lo he enviado
            </button>
          )}
        </div>
      </Section>
    );
  }

  if (step === "llamadas") {
    return (
      <Section number={3} title="Llamadas con las familias" status={info.status}>
        <Block title="Cómo son">
          <p>Cada mes tendrás dos llamadas por Zoom con los padres o tutores de tu alumno y con su coordinador.</p>
        </Block>
        <Block title="Para qué sirven">
          <ul className="list-disc space-y-1 pl-5">
            <li>Revisar la evolución del alumno.</li>
            <li>Comentar dificultades.</li>
            <li>Revisar objetivos.</li>
            <li>Coordinar el trabajo.</li>
            <li>Mantener informada a la familia.</li>
          </ul>
        </Block>
        <Block title="Condiciones profesionales">
          <ul className="list-disc space-y-1 pl-5">
            <li>En un espacio tranquilo.</li>
            <li>En un entorno ordenado y profesional.</li>
            <li>Sin ruidos ni interrupciones.</li>
            <li>Con una comunicación respetuosa y profesional.</li>
            <li>Respetando siempre la confidencialidad de la información familiar.</li>
          </ul>
        </Block>
        <div className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4">
          <p className="text-xs font-semibold text-[#555149]">Tu disponibilidad para las llamadas</p>
          {data.hasStudents ? (
            <p className="mt-1 text-xs text-[#806C50]">Ya tienes alumno asignado. ¿Ha cambiado tu disponibilidad? Vuelve a rellenarla: siempre contamos tu última respuesta.</p>
          ) : (
            <p className="mt-1 text-xs text-[#77736B]">Indica cuándo podrías hacer las llamadas. No hace falta tener alumno: con esto buscamos el hueco en el que podáis la familia, el coordinador y tú. Tu nombre y tu correo ya vienen puestos.</p>
          )}
          {data.callsFormUrl && (
            <a href={data.callsFormUrl} target="_blank" rel="noopener noreferrer" className={`${data.hasStudents ? primaryButton : secondaryButton} mt-2`}>
              {data.hasStudents ? "Actualizar mi disponibilidad" : "Indicar mi disponibilidad"} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        {info.status === "completado" ? (
          <p className="text-xs text-[#77736B]">Confirmaste que lo has leído{info.date ? ` el ${formatDate(info.date)}` : ""}.</p>
        ) : (
          <button type="button" disabled={busy} onClick={() => confirmStep("llamadas", "Gracias, queda anotado que lo has leído.")} className={primaryButton}>
            He leído cómo son las llamadas
          </button>
        )}
      </Section>
    );
  }

  return <OffersView data={data} reload={reload} notify={notify} />;
}

/** Formulario de entrega: nombre y apellidos + PDF. Quién entrega lo sabe el campus por la sesión. */
function CertificateUpload({ defaultName, hasPrevious, reload, notify }: {
  defaultName: string;
  hasPrevious: boolean;
  reload: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(defaultName);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (chosen: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!chosen) return;
    if (chosen.type && chosen.type !== "application/pdf") { notify("Tiene que ser el PDF que te descargaste del Ministerio, no una foto."); return; }
    if (chosen.size > MAX_CERTIFICATE_BYTES) { notify("El PDF pesa demasiado (máximo 4 MB). Sube el original del Ministerio."); return; }
    setFile(chosen);
  };

  const upload = async () => {
    const holder = name.replace(/\s+/g, " ").trim();
    if (holder.length < 3 || !holder.includes(" ")) { notify("Escribe tu nombre y apellidos tal como aparecen en el certificado."); return; }
    if (!file) { notify("Elige el PDF del certificado."); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("nombre", holder);
      body.append("file", file);
      await call("/api/mentor/certificado", { method: "POST", body });
      setFile(null);
      await reload();
      notify("Certificado recibido. Lo revisaremos y verás aquí su estado.");
    } catch (e) { notify(e instanceof Error ? e.message : "No se pudo subir el certificado."); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 border-t border-[#E7E3DC] pt-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#77736B]">{hasPrevious ? "Entregar otra vez" : "Entregar mi certificado"}</p>
      <div className="space-y-1">
        <label htmlFor="certificado-nombre" className="block text-xs font-semibold text-[#555149]">Nombre y apellidos (como aparecen en el certificado)</label>
        <input
          id="certificado-nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          autoComplete="name"
          className="w-full rounded-xl border border-[#E7E3DC] bg-white p-2.5 text-sm text-[#292825] focus:outline-none"
        />
      </div>
      <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={secondaryButton}>
          <Upload className="h-3.5 w-3.5" /> {file ? "Cambiar PDF" : "Elegir el PDF"}
        </button>
        {file && <span className="min-w-0 truncate text-xs text-[#45433F]">{file.name}</span>}
      </div>
      <button type="button" disabled={busy || !file} onClick={upload} className={primaryButton}>
        {busy ? "Enviando…" : "Enviar certificado"}
      </button>
      <p className="text-[11px] text-[#77736B]">Solo PDF, hasta 4 MB. Se guarda en un espacio privado: únicamente lo ven administración y el formador de Método Kiru.</p>
    </div>
  );
}

function OffersView({ data, reload, notify }: { data: MentorPanelData; reload: () => Promise<void>; notify: (text: string) => void }) {
  const waiting = data.offers.filter((o) => !o.response);
  const answered = data.offers.filter((o) => o.response);
  return (
    <Section number={4} title="Asignación de alumnos">
      <p className="text-sm text-[#45433F]">Aquí aparecen los alumnos que Método Kiru te propone, con la misma información que te llega por correo. Puedes responder desde aquí o desde el correo: vale cualquiera de las dos.</p>
      {data.offers.length === 0 && (
        <p className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 text-xs text-[#77736B]">Ahora mismo no tienes propuestas de alumnos.</p>
      )}
      {waiting.map((offer) => <OfferCard key={offer.id} offer={offer} reload={reload} notify={notify} />)}
      {answered.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#555149]">Propuestas respondidas</h3>
          {answered.map((offer) => <OfferCard key={offer.id} offer={offer} reload={reload} notify={notify} />)}
        </div>
      )}
    </Section>
  );
}

function OfferCard({ offer, reload, notify }: { offer: MentorOffer; reload: () => Promise<void>; notify: (text: string) => void }) {
  const [choice, setChoice] = useState<OfferResponse | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (response: OfferResponse) => {
    if (response === "ajustar" && !detail.trim()) { notify("No has indicado qué días y horas podrías."); return; }
    setBusy(true);
    try {
      await call(`/api/mentor/ofertas/${offer.id}`, { method: "POST", body: { response, detail: response === "ajustar" ? detail.trim() : "" } });
      await reload();
      notify("Respuesta enviada. Le llega a quien te ha propuesto el alumno.");
    } catch (e) { notify(e instanceof Error ? e.message : "No se pudo enviar la respuesta."); }
    finally { setBusy(false); }
  };

  const rows: [string, string][] = [
    ["Curso", offer.course],
    ["Perfil", offer.studentProfile],
    ["Zona", offer.zone],
    ["Intensidad que busca la familia", offer.intensity],
    ["Días y franjas posibles", offer.slots],
  ];

  return (
    <article className={`space-y-4 rounded-2xl border p-4 sm:p-5 ${offer.response ? "border-[#E7E3DC] bg-[#FAF8F5]" : "border-[#D9C8AE] bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-[#292825]">{offer.response ? "Posible alumno" : "Nuevo posible alumno para ti"}</p>
        <p className="text-[11px] text-[#77736B]">{formatDate(offer.sentAt)}</p>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {rows.filter(([, value]) => value).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-xs font-semibold text-[#77736B]">{label}</dt>
            <dd className="text-[#292825]">{value}</dd>
          </div>
        ))}
      </dl>
      {offer.response ? (
        <p className="text-xs text-[#555149]">
          Respondiste «{OFFER_RESPONSE_LABEL[offer.response]}»{offer.respondedAt ? ` el ${formatDate(offer.respondedAt)}` : ""}.
          {offer.responseDetail ? ` Disponibilidad indicada: ${offer.responseDetail}` : ""}
        </p>
      ) : (
        <>
          <p className="text-xs text-[#555149]">Para asignártelo necesitamos que puedas comprometerte con este alumno, en ese horario y ubicación, durante el resto del curso (es también una responsabilidad legal).</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => send("si")} className={primaryButton}>{OFFER_RESPONSE_LABEL.si}</button>
            <button type="button" disabled={busy} onClick={() => setChoice(choice === "ajustar" ? null : "ajustar")} className={secondaryButton}>{OFFER_RESPONSE_LABEL.ajustar}</button>
            <button type="button" disabled={busy} onClick={() => send("no")} className={secondaryButton}>{OFFER_RESPONSE_LABEL.no}</button>
          </div>
          {choice === "ajustar" && (
            <div className="space-y-2">
              <label htmlFor={`detalle-${offer.id}`} className="block text-[11px] font-bold uppercase tracking-wider text-[#77736B]">¿Qué días y horas podrías?</label>
              <textarea
                id={`detalle-${offer.id}`}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Ej.: martes 17:00-18:00 y jueves 18:30-19:30"
                className="w-full rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] p-2.5 text-xs text-[#45433F] focus:outline-none"
              />
              <button type="button" disabled={busy} onClick={() => send("ajustar")} className={primaryButton}>Enviar mi disponibilidad</button>
            </div>
          )}
          <p className="text-[11px] text-[#77736B]">Si no puedes, pulsa «No puedo» y te buscamos otro alumno. Si no respondes, no sabremos si sigues como mentor activo o prefieres darte de baja, así que te agradecemos una respuesta aunque sea un no.</p>
          <p className="text-[11px] text-[#77736B]">La dirección exacta y el contacto de la familia se comparten solo al formalizar la asignación.</p>
        </>
      )}
    </article>
  );
}

/** Flechas para pasar de un paso al anterior o al siguiente sin abrir el menú. */
export function StepPager({ step, onChange }: { step: StepId; onChange: (step: StepId) => void }) {
  const index = STEPS.findIndex((s) => s.id === step);
  const prev = STEPS[index - 1];
  const next = STEPS[index + 1];
  const go = (target: StepId) => { onChange(target); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return (
    <nav aria-label="Pasar de paso" className="flex items-center justify-between gap-2">
      {prev ? (
        <button type="button" onClick={() => go(prev.id)} className={secondaryButton} aria-label={`Paso anterior: ${prev.title}`}>
          <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">{prev.title}</span><span className="sm:hidden">Anterior</span>
        </button>
      ) : <span />}
      <span className="flex items-center gap-1.5" aria-label={`Paso ${index + 1} de ${STEPS.length}`}>
        {STEPS.map((s) => (
          <button key={s.id} type="button" onClick={() => go(s.id)} aria-label={s.title}
            className={`h-2 rounded-full transition-all ${s.id === step ? "w-5 bg-[#806C50]" : "w-2 bg-[#E4D8C5] hover:bg-[#D9C8AE]"}`} />
        ))}
      </span>
      {next ? (
        <button type="button" onClick={() => go(next.id)} className={primaryButton} aria-label={`Paso siguiente: ${next.title}`}>
          <span className="hidden sm:inline">{next.title}</span><span className="sm:hidden">Siguiente</span> <ChevronRight className="h-4 w-4" />
        </button>
      ) : <span />}
    </nav>
  );
}
