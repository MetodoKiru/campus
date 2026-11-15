import { Phone, Video, Users } from "lucide-react";

/**
 * Hueco reservado para las llamadas semanales con las familias. Mientras se
 * termina, explica las reglas; cuando esté listo, aquí irán el calendario de
 * llamadas, el registro de cada una, la valoración del mentor (1-5) tras las
 * llamadas de las semanas 1 y 4 y el enlace al grupo de WhatsApp de la familia.
 */
export default function FamilyCallsSoon() {
  const weeks = [
    { week: "Semana 1", who: "Familia + mentor + tú" },
    { week: "Semana 2", who: "Familia + tú" },
    { week: "Semana 3", who: "Familia + tú" },
    { week: "Semana 4", who: "Familia + mentor + tú" },
  ];
  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-violet-200 bg-violet-50 p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-800">Pronto en el campus</p>
        <h2 className="mt-1 font-serif text-xl font-bold text-[#292825]">Llamadas semanales con las familias</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#6D6962]">
          Estamos preparando esta página. Aquí verás las llamadas de cada semana, podrás registrar cómo fue cada una, valorar al mentor
          (de 1 a 5) después de las llamadas en las que participa y abrir el grupo de WhatsApp de cada familia. Mientras tanto, estas son las reglas.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Rule icon={Phone} title="Cada semana, 20 minutos">Una llamada por familia y semana. Procura una hora que se repita, aunque se puede mover.</Rule>
        <Rule icon={Video} title="Mejor por Zoom">Por teléfono si los padres lo prefieren. Mejor con los dos padres.</Rule>
        <Rule icon={Users} title="Quién está">El mentor solo entra en la primera y en la última semana del mes.</Rule>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {weeks.map((w) => (
          <div key={w.week} className="rounded-2xl border border-[#E7E3DC] bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{w.week}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{w.who}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Rule({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E7E3DC] bg-white p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Icon className="h-4 w-4 text-cyan-800" /> {title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-[#6D6962]">{children}</p>
    </div>
  );
}
