"use client";

import { useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";

/**
 * Inicio de la familia: cómo funciona la plataforma en tarjetas que se deslizan
 * de lado y se giran (delante para qué sirve, detrás qué hacer). Poco texto y poco
 * scroll. Solo muestra; no guarda nada. Mantener al día si cambian las pestañas.
 */
export type FamilyTab = "inicio" | "sesiones" | "progreso" | "recompensas" | "informes" | "documentos" | "pagos";

interface Card { what: string; hint: string; how: string; tab?: FamilyTab }

const PAGES: Card[] = [
  { what: "Inicio", hint: "Lo que os toca hacer ahora", tab: "inicio",
    how: "Vuestros primeros pasos, la llamada semanal, la evaluación cuando toca, la renovación y los avisos. Si algo os espera, aparece aquí arriba." },
  { what: "Sesiones", hint: "Clases, cambios y recuperaciones", tab: "sesiones",
    how: "Veis las próximas clases y las ya hechas, con el tema de cada una. Desde aquí se cambia o cancela una clase y se elige la fecha de recuperación." },
  { what: "Progreso", hint: "Sus SkillCoins de cada semana", tab: "progreso",
    how: "Cada semana el mentor puntúa estudios, compromiso, organización y bienestar. Aquí veis la nota y cómo evoluciona." },
  { what: "Recompensas", hint: "Lo que quiere conseguir con sus SkillCoins", tab: "recompensas",
    how: "Vuestro hijo/a propone un objetivo y vosotros lo aprobáis o no. Las SkillCoins solo se descuentan cuando confirmáis que se lo habéis dado." },
  { what: "Informes", hint: "Cómo va, por escrito", tab: "informes",
    how: "Su coordinador os prepara un informe de progreso. Os avisamos cuando está listo y aquí quedan todos, para ver su evolución." },
  { what: "Mis documentos", hint: "Papeles de Método Kiru", tab: "documentos",
    how: "Dossier, condiciones y otros PDF. Si alguno dice «Pendiente de aceptación», abridlo y aceptadlo." },
  { what: "Mis pagos", hint: "Cuotas y sesiones de cada periodo", tab: "pagos",
    how: "Lo pagado y lo pendiente, con las sesiones previstas, hechas y por hacer de cada mensualidad. La renovación os llega a Inicio y por correo." },
];

const HOWTO: Card[] = [
  { what: "Cancelar o cambiar una clase", hint: "Sesiones › «Cambiar o cancelar»", tab: "sesiones",
    how: "Pulsad «Cambiar o cancelar» en esa clase y escribid el motivo. Con 48 h de aviso conserváis la sesión y la recuperáis. Con menos, cuenta como hecha." },
  { what: "Recuperar una clase", hint: "Sesiones › «Elegid la fecha»", tab: "sesiones",
    how: "El mentor os propone fechas y vosotros elegís una. Si hay días en los que nunca podéis, marcadlos en «¿Cuándo no podéis recuperar clases?»." },
  { what: "Mover la llamada de esta semana", hint: "Inicio › «Mover esta semana»", tab: "inicio",
    how: "En la tarjeta de la llamada semanal, pulsad «Mover esta semana» y elegid otra hora libre. Avisamos al coordinador solos." },
  { what: "Renovar o cambiar días", hint: "Inicio › tarjeta de renovación", tab: "inicio",
    how: "Antes de que acabe la mensualidad os llega la renovación. Podéis mantener, bajar o subir días de clase. Si cambiáis, elegís el nuevo horario." },
  { what: "Ver los avisos", hint: "La campana, arriba a la derecha",
    how: "Cada aviso os lleva a la página donde se resuelve. También os llegan por correo, así que no hace falta entrar cada día." },
  { what: "Hablar con nosotros", hint: "WhatsApp o la llamada semanal",
    how: "Para cualquier duda, escribid a vuestro coordinador por el grupo de WhatsApp o contádnoslo en la llamada semanal." },
];

export default function FamilyGuide({ onGo }: { onGo?: (tab: FamilyTab) => void }) {
  const [view, setView] = useState<"paginas" | "como">("como");
  const cards = view === "paginas" ? PAGES : HOWTO;
  return (
    <section className="space-y-3" aria-label="Cómo funciona vuestro campus">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg font-bold text-[#292825]">Cómo funciona vuestro campus</h3>
        <p className="text-[11px] text-[#8D887F]">Girad una tarjeta para leerla</p>
      </div>
      <div className="flex gap-1 rounded-2xl border border-[#E7E3DC] bg-white p-1" role="tablist">
        {([["como", "¿Cómo hago…?"], ["paginas", "Vuestras páginas"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
            className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${view === id ? "bg-[#3F3A33] text-white" : "text-[#6D6962] hover:bg-[#F3EFE8]"}`}>
            {label}
          </button>
        ))}
      </div>
      <Carousel key={view} cards={cards} onGo={onGo} />
    </section>
  );
}

function Carousel({ cards, onGo }: { cards: Card[]; onGo?: (tab: FamilyTab) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const move = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * 240, behavior: "smooth" });
  return (
    <div>
      <div ref={row} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {cards.map((c) => <FlipCard key={c.what} card={c} onGo={onGo} />)}
      </div>
      <div className="mt-1 flex justify-end gap-1.5">
        <button type="button" onClick={() => move(-1)} aria-label="Anterior" className="rounded-full border border-[#E7E3DC] bg-white p-1.5 text-[#6D6962] hover:bg-[#F3EFE8]"><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" onClick={() => move(1)} aria-label="Siguiente" className="rounded-full border border-[#E7E3DC] bg-white p-1.5 text-[#6D6962] hover:bg-[#F3EFE8]"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/** Delante: qué es y dónde está. Detrás: qué hacer, y botón para ir. */
function FlipCard({ card, onGo }: { card: Card; onGo?: (tab: FamilyTab) => void }) {
  const [flipped, setFlipped] = useState(false);
  const face = "absolute inset-0 flex flex-col rounded-2xl border p-4 [backface-visibility:hidden]";
  return (
    <div className="h-40 w-56 shrink-0 snap-start [perspective:1000px]">
      <div className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${flipped ? "[transform:rotateY(180deg)]" : ""}`}>
        <button type="button" onClick={() => setFlipped(true)} aria-hidden={flipped} tabIndex={flipped ? -1 : 0}
          className={`${face} border-[#E7E3DC] bg-white text-left hover:border-[#CDBFAE]`}>
          <span className="font-serif text-base font-bold leading-snug text-[#292825]">{card.what}</span>
          <span className="mt-1 text-[11.5px] leading-snug text-[#77736B]">{card.hint}</span>
          <span className="mt-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#8D887F]"><RotateCw className="h-3.5 w-3.5" /> Ver cómo</span>
        </button>
        <div aria-hidden={!flipped} className={`${face} border-[#DCCFBF] bg-[#F6F2EC] [transform:rotateY(180deg)]`}>
          <p className="text-[11.5px] leading-relaxed text-[#4A4640]">{card.how}</p>
          <div className="mt-auto flex items-center justify-between pt-2">
            <button type="button" tabIndex={flipped ? 0 : -1} onClick={() => setFlipped(false)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8D887F] hover:text-[#4A4640]"><RotateCw className="h-3.5 w-3.5" /> Volver</button>
            {card.tab && onGo && (
              <button type="button" tabIndex={flipped ? 0 : -1} onClick={() => onGo(card.tab as FamilyTab)} className="inline-flex items-center gap-1 rounded-lg bg-[#3F3A33] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#2C2823]">
                Ir <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
