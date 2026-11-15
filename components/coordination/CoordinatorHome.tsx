"use client";

import { AlertTriangle, ArrowRight, Bell, CalendarClock, CalendarDays, CheckCircle2, Compass, Mail, Phone, Users } from "lucide-react";
import type { CoordinatorTab } from "@/components/coordination/CoordinatorSidebar";

/**
 * Pestaña «Inicio» del panel del coordinador: cómo se organiza la plataforma,
 * qué hay pendiente hoy y la rutina (qué hacer, cada cuánto y cómo), con un
 * botón a la página de cada tarea. Solo muestra; no guarda nada.
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
interface Block { id: string; when: string; hint: string; icon: React.ElementType; tasks: Task[] }

const ROUTINE: Block[] = [
  {
    id: "dia",
    when: "Cada día",
    hint: "5–10 minutos, mejor a la misma hora",
    icon: Bell,
    tasks: [
      { what: "Mira la campana de avisos", how: "Arriba a la derecha. Cada aviso te lleva a la página donde se resuelve (una recuperación parada, un registro con error, una disponibilidad nueva…). También te llegan por correo." },
      { what: "Revisa las incidencias", how: "Lee lo que el mentor escribió en «Incidencia» al registrar la sesión, habla con quien haga falta y pulsa «Marcar como revisada» con una nota corta. La nota no la ve el mentor.", tab: "incidencias" },
      { what: "Atiende cambios de clase y recuperaciones", how: "Responde a las solicitudes de cambio o cancelación. Si una recuperación lleva 3 días sin avanzar, recuérdaselo al mentor o propón fechas tú: las fechas siempre las propone el mentor o la coordinación, la familia solo elige.", tab: "clases" },
    ],
  },
  {
    id: "semana",
    when: "Cada semana",
    hint: "Lunes, para empezar la semana con todo al día",
    icon: CalendarDays,
    tasks: [
      { what: "Comprueba que cada alumno tiene su registro", how: "En «Mis mentores», una tarjeta en «Revisar» significa que algún alumno lleva más de 8 días sin registro de sesión o que hay incidencias abiertas. Pulsa la tarjeta para ver qué alumno es y escribe al mentor.", tab: "mentores" },
      { what: "Valora las notas de SkillCoins", how: "En «Supervisión», abre las que pone «Por valorar»: ves la nota y lo que el mentor escribió esa semana. Los indicadores solo señalan qué mirar; nada de lo que hagas cambia las SkillCoins.", tab: "supervision" },
      { what: "Llamada semanal con cada familia (20 min)", how: "Por Zoom, o por teléfono si los padres lo prefieren; mejor con los dos padres y a una hora que se repita. Semana 1 y semana 4: familia + mentor + tú. Semanas 2 y 3: familia + tú.", tab: "llamadas", soon: true },
    ],
  },
  {
    id: "mes",
    when: "Cada mes",
    hint: "Ponte un recordatorio en tu calendario",
    icon: CalendarClock,
    tasks: [
      { what: "Reunión de coordinación con tu grupo (30 min)", how: "Mira qué día puede la mayoría de tus mentores, elige fecha y hora, pon el enlace de Zoom y pulsa «Convocar». Después, márcala como realizada y rellena el registro.", tab: "reuniones" },
      { what: "Informe de progreso de cada alumno", how: "Te avisamos cuando toca. Crea el borrador (el campus junta los registros del periodo), complétalo y publícalo como muy tarde 4 días antes del fin del periodo de la familia. Puedes prepararlo antes de la llamada.", tab: "informes" },
      { what: "Seguimiento de herramientas y Cálculalo", how: "Revisa la ficha mensual de Cálculalo, las herramientas obligatorias de cada alumno y los errores marcados en los registros.", tab: "seguimiento" },
      { what: "Renovaciones: disponibilidad del mentor", how: "12 días antes de que acabe la mensualidad, el mentor confirma si sigue con sus clases. Si dice que no puede, te llega un correo: búscale solución con él. Lo que contestó lo ves en «Disponibilidad de mentores».", tab: "disponibilidad" },
    ],
  },
  {
    id: "trimestre",
    when: "Cada 3 meses",
    hint: "Llega solo, a los 3 meses de la primera sesión de cada alumno",
    icon: CheckCircle2,
    tasks: [
      { what: "Evaluación trimestral", how: "El campus manda el formulario a la familia y al mentor. Tú compruebas que los dos lo rellenan y lees los resultados.", tab: "evaluaciones" },
      { what: "Cómo valoran las familias a tus mentores", how: "Con la evaluación, cada familia puntúa a su mentor de 1 a 5. Una nota de 1 o 2 te avisa: llama a la familia y habla con el mentor. El mentor no ve estas notas.", tab: "evaluaciones" },
    ],
  },
  {
    id: "cuando",
    when: "Cuando toque",
    hint: "Te llega un aviso o un correo",
    icon: Mail,
    tasks: [
      { what: "Propuestas de alumnos", how: "Cuando entra un alumno nuevo, ves los mentores candidatos y sus respuestas. WhatsApp y correo abren el mensaje preparado: lo envías tú.", tab: "propuestas" },
      { what: "Navidad y Semana Santa", how: "Revisa qué contestan familias y mentores y prepara el plan de cada alumno (sustitutos si hace falta).", tab: "vacaciones" },
      { what: "Disponibilidad nueva de un mentor", how: "Cuando un mentor envía o cambia su disponibilidad te llega un aviso. Sirve para saber qué día podría dar una clase más si una familia la pide.", tab: "disponibilidad" },
      { what: "Crece con Kiru", how: "Si ves a un mentor de tu grupo preparado para una oportunidad publicada, recomiéndalo. La decisión es de administración.", tab: "crece" },
    ],
  },
];

export default function CoordinatorHome({ name, isAdmin, counts, onGo }: {
  name: string;
  isAdmin: boolean;
  counts: Counts;
  onGo: (tab: CoordinatorTab) => void;
}) {
  const pending: { label: string; n: number; tab: CoordinatorTab }[] = [
    { label: counts.openIncidents === 1 ? "incidencia sin revisar" : "incidencias sin revisar", n: counts.openIncidents, tab: "incidencias" },
    { label: counts.staleStudents === 1 ? "alumno lleva más de 8 días sin registro" : "alumnos llevan más de 8 días sin registro", n: counts.staleStudents, tab: "mentores" },
  ];
  if (isAdmin) pending.push({ label: counts.unassigned === 1 ? "registro sin asignar" : "registros sin asignar", n: counts.unassigned, tab: "sin-asignar" });
  const today = pending.filter((t) => t.n > 0);

  return (
    <div className="space-y-6">
      {/* Saludo y resumen */}
      <section className="rounded-3xl border border-[#E7E3DC] bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="font-serif text-2xl font-bold text-[#292825]">Hola, {name.split(" ")[0]}</h2>
        <p className="mt-1 max-w-3xl text-sm text-[#6D6962]">
          Este es tu panel. A la izquierda tienes todas las páginas ordenadas por tema; aquí abajo, lo que tienes pendiente hoy y tu rutina de coordinación.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Mentores" value={counts.mentors} />
          <Stat label="Alumnos" value={counts.students} />
          <Stat label="Registros (30 días)" value={counts.recentLogs} />
          <Stat label="Incidencias sin revisar" value={counts.openIncidents} warn={counts.openIncidents > 0} />
        </div>
      </section>

      {/* Pendiente hoy */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[.14em] text-[#8D887F]">Pendiente ahora</h3>
        {today.length === 0 ? (
          <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 className="h-4 w-4" /> Todo al día. Mira igualmente la campana por si hay avisos nuevos.
          </p>
        ) : (
          <ul className="space-y-2">
            {today.map((t) => (
              <li key={t.tab}>
                <button type="button" onClick={() => onGo(t.tab)} className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 hover:bg-amber-100">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="flex-1"><strong>{t.n}</strong> {t.label}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cómo se organiza */}
      <section className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[.14em] text-[#8D887F]">Cómo se organiza tu plataforma</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <Explain icon={Users} title="Tu grupo">
            Llevas hasta 5 mentores. Sus alumnos y familias te llegan a través del mentor: si un alumno cambia de mentor, cambia de coordinador solo. Administración crea las cuentas y hace los enlaces.
          </Explain>
          <Explain icon={Compass} title="Lo que llega solo">
            Los registros de sesión (del formulario de Google, al momento), los avisos de la campana, los correos de renovación y las evaluaciones cada 3 meses. No tienes que copiar nada a mano.
          </Explain>
          <Explain icon={Phone} title="Lo que haces tú">
            Revisar, hablar con mentores y familias y decidir. Ningún mensaje sale solo: los botones de WhatsApp y correo te preparan el texto y lo envías tú. Pagos y usuarios los lleva administración.
          </Explain>
        </div>
      </section>

      {/* Rutina */}
      <section className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[.14em] text-[#8D887F]">Tu rutina: qué hacer, cada cuánto y cómo</h3>
        {ROUTINE.map((block) => {
          const Icon = block.icon;
          const tasks = block.tasks.filter((t) => !(isAdmin && t.tab === "crece"));
          return (
            <article key={block.id} className="rounded-3xl border border-[#E7E3DC] bg-white p-5 shadow-sm">
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h4 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]"><Icon className="h-5 w-5 text-cyan-800" /> {block.when}</h4>
                <span className="text-xs text-[#8D887F]">{block.hint}</span>
              </header>
              <ol className="mt-3 divide-y divide-[#F0EDE7]">
                {tasks.map((task, i) => (
                  <li key={task.what} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-[11px] font-bold text-cyan-800">{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {task.what}
                        {task.soon && <span className="ml-2 rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-800">Pronto en el campus</span>}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-[#6D6962]">{task.how}</p>
                    </div>
                    {task.tab && (
                      <button type="button" onClick={() => onGo(task.tab as CoordinatorTab)} className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                        Ir <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${warn ? "bg-amber-50 border-amber-200" : "bg-[#FAF9F6] border-[#E7E3DC]"}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warn ? "text-amber-800" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Explain({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E7E3DC] bg-white p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Icon className="h-4 w-4 text-cyan-800" /> {title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-[#6D6962]">{children}</p>
    </div>
  );
}
