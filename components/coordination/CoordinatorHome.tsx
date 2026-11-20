"use client";

import { useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import type { CoordinatorTab } from "@/components/coordination/CoordinatorSidebar";

/**
 * Pestaña «Inicio» del panel del coordinador: lo pendiente, cómo se organiza la
 * plataforma y la rutina (qué hacer, cada cuánto y cómo). Para que quepa en una
 * pantalla, la rutina va en tarjetas que se deslizan de lado y se giran para
 * leer cómo se hace cada tarea. Solo muestra; no guarda nada.
 */

interface Counts {
  mentors: number;
  students: number;
  recentLogs: number;
  openIncidents: number;
  staleStudents: number;
  unassigned: number;
}

interface Task { what: string; how: string; tab?: CoordinatorTab; soon?: boolean }
interface Block { id: string; when: string; hint: string; tasks: Task[] }

const ROUTINE: Block[] = [
  {
    id: "dia",
    when: "Cada día",
    hint: "5–10 minutos, mejor a la misma hora",
    tasks: [
      { what: "Mirar la campana de avisos", how: "Está arriba a la derecha. Cada aviso te lleva a la página donde se resuelve (una recuperación parada, un registro con error, una disponibilidad nueva…). También te llegan por correo." },
      { what: "Leer las incidencias", how: "Una incidencia es algo que ha pasado con el alumno durante la clase. No es un fallo del mentor: sirve para consultar y seguir su evolución. Léela y márcala como revisada.", tab: "incidencias" },
      { what: "Cambios de clase y recuperaciones", how: "Responde a las solicitudes de cambio o cancelación. Si una recuperación lleva 3 días parada, recuérdaselo al mentor o propón fechas tú. La familia solo elige entre las fechas propuestas.", tab: "clases" },
    ],
  },
  {
    id: "semana",
    when: "Cada semana",
    hint: "Los lunes, para empezar al día",
    tasks: [
      { what: "Que cada alumno tenga su registro", how: "En «Mis mentores», una tarjeta en «Revisar» quiere decir que un alumno lleva más de 8 días sin registro o que hay incidencias sin leer. Púlsala para ver cuál y escribe al mentor.", tab: "mentores" },
      { what: "Valorar las notas de SkillCoins", how: "En «Supervisión», abre las que dicen «Por valorar»: verás la nota y lo que escribió el mentor esa semana. Nada de lo que hagas ahí cambia las SkillCoins.", tab: "supervision" },
      { what: "Llamada con cada familia (20 min)", how: "El campus fija la hora sola con la disponibilidad de todos. Zoom, mejor con los dos padres. Semanas 1 y 4: familia, mentor y tú; después valora al mentor de 1 a 5. Semanas 2 y 3: familia y tú.", tab: "llamadas" },
    ],
  },
  {
    id: "mes",
    when: "Cada mes",
    hint: "Ponte un recordatorio en el calendario",
    tasks: [
      { what: "Reunión con tu grupo (30 min)", how: "Mira qué día puede la mayoría de tus mentores, pon fecha, hora y enlace de Zoom y pulsa «Convocar». Después márcala como realizada y rellena el registro.", tab: "reuniones" },
      { what: "Informe de progreso", how: "Te avisamos cuando toca. Crea el borrador (el campus junta los registros del periodo), complétalo y publícalo como tarde 4 días antes de que acabe el periodo de la familia.", tab: "informes" },
      { what: "Herramientas y Cálculalo", how: "Revisa la ficha mensual de Cálculalo, las herramientas obligatorias de cada alumno y los errores marcados en los registros.", tab: "seguimiento" },
      { what: "Renovaciones", how: "12 días antes de que acabe la mensualidad, el mentor confirma si sigue con sus clases. Si dice que no puede, te llega un correo: buscad juntos una solución.", tab: "disponibilidad" },
    ],
  },
  {
    id: "trimestre",
    when: "Cada 3 meses",
    hint: "Llega solo, a los 3 meses de la primera clase",
    tasks: [
      { what: "Evaluación trimestral", how: "El campus manda el formulario a la familia y al mentor. Tú compruebas que los dos lo rellenan y lees los resultados.", tab: "evaluaciones" },
      { what: "Valoración de las familias", how: "Cada familia puntúa a su mentor de 1 a 5. Si alguna pone 1 o 2 te avisamos: llama a la familia y habla con el mentor. El mentor no ve estas notas.", tab: "evaluaciones" },
    ],
  },
  {
    id: "cuando",
    when: "Cuando toque",
    hint: "Te llega un aviso o un correo",
    tasks: [
      { what: "Propuestas de alumnos", how: "Cuando entra un alumno nuevo ves los mentores candidatos y sus respuestas. Los botones de WhatsApp y correo te preparan el mensaje: lo envías tú.", tab: "propuestas" },
      { what: "Información de una familia", how: "Al empezar, las familias pueden dejarnos (si quieren) el contacto del colegio o del psicólogo y subir informes o notas. Te llega un aviso: léelo antes de su primera llamada.", tab: "info-familias" },
      { what: "Navidad y Semana Santa", how: "Revisa lo que contestan familias y mentores y prepara el plan de cada alumno, con sustituto si hace falta.", tab: "vacaciones" },
      { what: "Disponibilidad de un mentor", how: "Cuando un mentor envía o cambia su disponibilidad te llega un aviso. Sirve para saber qué día podría dar una clase más si una familia la pide.", tab: "disponibilidad" },
      { what: "Crece con Kiru", how: "Si ves a un mentor de tu grupo preparado para una oportunidad publicada, recomiéndalo. La decisión es de administración.", tab: "crece" },
    ],
  },
];

const ORGANIZE: Task[] = [
  { what: "Tu grupo", how: "Llevas hasta 5 mentores. Sus alumnos y familias te llegan a través del mentor: si un alumno cambia de mentor, cambia de coordinador solo. Las cuentas y los enlaces los hace administración." },
  { what: "Lo que llega solo", how: "Los registros de sesión, los avisos de la campana, los correos de renovación y las evaluaciones cada 3 meses. No tienes que copiar nada a mano." },
  { what: "Lo que haces tú", how: "Revisar, hablar con mentores y familias y decidir. Ningún mensaje sale solo: los botones te preparan el texto y lo envías tú. Pagos y usuarios los lleva administración." },
];

export default function CoordinatorHome({ name, isAdmin, counts, onGo }: {
  name: string;
  isAdmin: boolean;
  counts: Counts;
  onGo: (tab: CoordinatorTab) => void;
}) {
  const [blockId, setBlockId] = useState(ROUTINE[0].id);
  const block = ROUTINE.find((b) => b.id === blockId) ?? ROUTINE[0];
  const tasks = block.tasks.filter((t) => !(isAdmin && t.tab === "crece"));

  const pending: { label: string; n: number; tab: CoordinatorTab }[] = [
    { label: counts.openIncidents === 1 ? "incidencia por leer" : "incidencias por leer", n: counts.openIncidents, tab: "incidencias" },
    { label: counts.staleStudents === 1 ? "alumno sin registro en 8 días" : "alumnos sin registro en 8 días", n: counts.staleStudents, tab: "mentores" },
  ];
  if (isAdmin) pending.push({ label: counts.unassigned === 1 ? "registro sin asignar" : "registros sin asignar", n: counts.unassigned, tab: "sin-asignar" });
  const today = pending.filter((t) => t.n > 0);

  return (
    <div className="space-y-6 text-[#343330]">
      {/* Saludo, cifras y pendientes en una sola franja */}
      <section className="rounded-3xl border border-[#E7E3DC] bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-bold text-[#292825]">Hola, {name.split(" ")[0]}</h2>
            <p className="mt-1 text-sm text-[#6D6962]">Las páginas están a la izquierda. Aquí tienes lo pendiente y tu rutina.</p>
          </div>
          <dl className="flex gap-6 text-sm">
            <Figure label="Mentores" value={counts.mentors} />
            <Figure label="Alumnos" value={counts.students} />
            <Figure label="Registros 30 días" value={counts.recentLogs} />
          </dl>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-[#EFEBE4] pt-4">
          {today.length === 0 ? (
            <span className="text-sm text-[#5F6B47]">Todo al día. Mira igualmente la campana por si hay avisos nuevos.</span>
          ) : today.map((t) => (
            <button key={t.tab} type="button" onClick={() => onGo(t.tab)} className="inline-flex items-center gap-2 rounded-full border border-[#E2D3C4] bg-[#F6EEE6] px-3.5 py-1.5 text-xs font-semibold text-[#7A4A30] hover:bg-[#F0E4D8]">
              <strong>{t.n}</strong> {t.label} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </section>

      {/* Rutina: elige la frecuencia y desliza las tarjetas */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-lg font-bold text-[#292825]">Tu rutina</h3>
          <p className="text-xs text-[#8D887F]">Gira una tarjeta para ver cómo se hace</p>
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[#E7E3DC] bg-white p-1" role="tablist">
          {ROUTINE.map((b) => (
            <button key={b.id} type="button" role="tab" aria-selected={b.id === block.id} onClick={() => setBlockId(b.id)}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${b.id === block.id ? "bg-[#3F3A33] text-white" : "text-[#6D6962] hover:bg-[#F3EFE8]"}`}>
              {b.when}
            </button>
          ))}
        </div>
        <p className="text-xs text-[#8D887F]">{block.hint}</p>
        <Carousel key={block.id} tasks={tasks} onGo={onGo} />
      </section>

      {/* Cómo se organiza */}
      <section className="space-y-3">
        <h3 className="font-serif text-lg font-bold text-[#292825]">Cómo se organiza tu plataforma</h3>
        <Carousel tasks={ORGANIZE} onGo={onGo} flipLabel="Leer" />
      </section>
    </div>
  );
}

function Carousel({ tasks, onGo, flipLabel = "Cómo se hace" }: { tasks: Task[]; onGo: (tab: CoordinatorTab) => void; flipLabel?: string }) {
  const row = useRef<HTMLDivElement>(null);
  const move = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  return (
    <div className="relative">
      <div ref={row} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {tasks.map((task) => <FlipCard key={task.what} task={task} onGo={onGo} flipLabel={flipLabel} />)}
      </div>
      {tasks.length > 2 && (
        <div className="mt-1 flex justify-end gap-1.5">
          <button type="button" onClick={() => move(-1)} aria-label="Anterior" className="rounded-full border border-[#E7E3DC] bg-white p-1.5 text-[#6D6962] hover:bg-[#F3EFE8]"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => move(1)} aria-label="Siguiente" className="rounded-full border border-[#E7E3DC] bg-white p-1.5 text-[#6D6962] hover:bg-[#F3EFE8]"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

/** Tarjeta que se gira: delante qué hay que hacer, detrás cómo se hace. */
function FlipCard({ task, onGo, flipLabel }: { task: Task; onGo: (tab: CoordinatorTab) => void; flipLabel: string }) {
  const [flipped, setFlipped] = useState(false);
  const face = "absolute inset-0 flex flex-col rounded-2xl border p-4 [backface-visibility:hidden]";
  return (
    <div className="h-44 w-64 shrink-0 snap-start [perspective:1000px]">
      <div className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${flipped ? "[transform:rotateY(180deg)]" : ""}`}>
        {/* Delante */}
        <button type="button" onClick={() => setFlipped(true)} aria-hidden={flipped} tabIndex={flipped ? -1 : 0}
          className={`${face} border-[#E7E3DC] bg-white text-left hover:border-[#CDBFAE]`}>
          {task.soon && <span className="mb-2 w-fit rounded-md bg-[#EEE8DD] px-1.5 py-0.5 text-[10px] font-semibold text-[#6B5A3E]">Pronto en el campus</span>}
          <span className="font-serif text-base font-bold leading-snug text-[#292825]">{task.what}</span>
          <span className="mt-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#8D887F]"><RotateCw className="h-3.5 w-3.5" /> {flipLabel}</span>
        </button>
        {/* Detrás */}
        <div aria-hidden={!flipped} className={`${face} border-[#DCCFBF] bg-[#F6F2EC] [transform:rotateY(180deg)]`}>
          <p className="text-[12px] leading-relaxed text-[#4A4640]">{task.how}</p>
          <div className="mt-auto flex items-center justify-between pt-2">
            <button type="button" tabIndex={flipped ? 0 : -1} onClick={() => setFlipped(false)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8D887F] hover:text-[#4A4640]"><RotateCw className="h-3.5 w-3.5" /> Volver</button>
            {task.tab && (
              <button type="button" tabIndex={flipped ? 0 : -1} onClick={() => onGo(task.tab as CoordinatorTab)} className="inline-flex items-center gap-1 rounded-lg bg-[#3F3A33] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#2C2823]">
                Ir <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] text-[#8D887F]">{label}</dt>
      <dd className="font-serif text-2xl font-bold text-[#292825]">{value}</dd>
    </div>
  );
}
