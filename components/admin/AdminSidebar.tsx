"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, Bell, CalendarDays, CalendarOff, ChevronDown, ChevronsLeft, ChevronsRight, ClipboardCheck, ClipboardList,
  Coins, Compass, CreditCard, Eye, FileText, Gauge, GraduationCap, Menu, ShieldCheck, Sprout, UserCheck, Users, Wallet, X,
} from "lucide-react";

export type AdminSection =
  | "usuarios" | "alumnos" | "documentos" | "pagos" | "avisos" | "evaluaciones" | "skillcoins"
  | "propuestas" | "incorporacion" | "pagos-mentores" | "crece"
  | "dias-sin-clase" | "periodos-especiales" | "horarios" | "desempeno";

export const ADMIN_SECTIONS: AdminSection[] = [
  "usuarios", "alumnos", "documentos", "pagos", "avisos", "evaluaciones", "skillcoins",
  "propuestas", "incorporacion", "pagos-mentores", "crece", "dias-sin-clase", "periodos-especiales", "horarios", "desempeno",
];

type Item =
  | { kind: "section"; id: AdminSection; label: string; icon: React.ElementType }
  | { kind: "link"; href: string; label: string; icon: React.ElementType; note?: string };

interface Group { id: string; title: string; items: Item[] }

/**
 * Menú del panel de administración, agrupado por lo que quieres hacer.
 * Las secciones se abren dentro del panel; los enlaces con «↗» llevan a otro panel
 * (coordinación o formación), donde administración también puede entrar.
 */
const GROUPS: Group[] = [
  {
    id: "personas",
    title: "Personas y cuentas",
    items: [
      { kind: "section", id: "usuarios", label: "Usuarios y enlaces", icon: Users },
      { kind: "link", href: "/coordinador?tab=sin-asignar", label: "Registros sin asignar", icon: AlertTriangle, note: "coordinación" },
    ],
  },
  {
    id: "familias",
    title: "Alumnos y familias",
    items: [
      { kind: "section", id: "alumnos", label: "Mis alumnos (activos y pagos)", icon: GraduationCap },
      { kind: "section", id: "evaluaciones", label: "Evaluaciones (inicial y académica)", icon: ClipboardCheck },
      { kind: "section", id: "documentos", label: "Documentos PDF", icon: FileText },
      { kind: "section", id: "avisos", label: "Avisos", icon: Bell },
      { kind: "section", id: "pagos", label: "Pagos de familias", icon: CreditCard },
      { kind: "section", id: "skillcoins", label: "SkillCoins y recompensas", icon: Coins },
      { kind: "link", href: "/coordinador?tab=informes", label: "Informes de progreso", icon: ClipboardList, note: "coordinación" },
    ],
  },
  {
    id: "clases",
    title: "Clases y calendario",
    items: [
      { kind: "link", href: "/coordinador?tab=clases", label: "Clases y recuperaciones", icon: CalendarDays, note: "coordinación" },
      { kind: "link", href: "/coordinador?tab=registros", label: "Registros de sesión", icon: ClipboardList, note: "coordinación" },
      { kind: "section", id: "horarios", label: "Cambios de horario y disponibilidad", icon: CalendarDays },
      { kind: "section", id: "dias-sin-clase", label: "Días sin clase", icon: CalendarOff },
      { kind: "section", id: "periodos-especiales", label: "Navidad y Semana Santa", icon: CalendarOff },
    ],
  },
  {
    id: "mentores",
    title: "Mentores",
    items: [
      { kind: "link", href: "/formador", label: "Incorporación de mentores", icon: GraduationCap, note: "formación" },
      { kind: "section", id: "incorporacion", label: "Autorizaciones de mentores", icon: UserCheck },
      { kind: "section", id: "propuestas", label: "Propuestas a mentores", icon: Users },
      { kind: "link", href: "/coordinador", label: "Seguimiento de mentores", icon: Compass, note: "coordinación" },
      { kind: "link", href: "/coordinador?tab=incidencias", label: "Incidencias", icon: AlertTriangle, note: "coordinación" },
      { kind: "link", href: "/coordinador?tab=supervision", label: "Supervisión", icon: ClipboardCheck, note: "coordinación" },
      { kind: "link", href: "/coordinador?tab=reuniones", label: "Reuniones de coordinación", icon: CalendarDays, note: "coordinación" },
      { kind: "section", id: "desempeno", label: "Desempeño de mentores", icon: Gauge },
      { kind: "section", id: "pagos-mentores", label: "Pagos de mentores", icon: Wallet },
      { kind: "section", id: "crece", label: "Crece con Kiru", icon: Sprout },
    ],
  },
  {
    id: "revisar",
    title: "Revisar el campus",
    items: [
      { kind: "link", href: "/previsualizacion", label: "Ver el campus como…", icon: Eye },
    ],
  },
];

export const SECTION_LABEL: Record<AdminSection, string> = Object.fromEntries(
  GROUPS.flatMap((g) => g.items).filter((i): i is Extract<Item, { kind: "section" }> => i.kind === "section").map((i) => [i.id, i.label]),
) as Record<AdminSection, string>;

const STORAGE_KEY = "kiru_admin_sidebar";

function readPrefs(): { narrow: boolean; closed: string[] } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return { narrow: Boolean(parsed?.narrow), closed: Array.isArray(parsed?.closed) ? parsed.closed : [] };
  } catch {
    return { narrow: false, closed: [] };
  }
}

function savePrefs(prefs: { narrow: boolean; closed: string[] }) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* sin almacenamiento: no pasa nada */ }
}

export default function AdminSidebar({ active, onSelect }: { active: AdminSection; onSelect: (s: AdminSection) => void }) {
  const [narrow, setNarrow] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const prefs = readPrefs();
      setNarrow(prefs.narrow);
      setClosed(prefs.closed);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleNarrow = () => {
    const next = !narrow;
    setNarrow(next);
    savePrefs({ narrow: next, closed });
  };
  const toggleGroup = (id: string) => {
    const next = closed.includes(id) ? closed.filter((g) => g !== id) : [...closed, id];
    setClosed(next);
    savePrefs({ narrow, closed: next });
  };

  const renderNav = (compact: boolean) => (
    <nav className="space-y-3">
      {GROUPS.map((group) => {
        const isClosed = !compact && closed.includes(group.id);
        const hasActive = group.items.some((i) => i.kind === "section" && i.id === active);
        return (
          <div key={group.id}>
            {compact ? (
              <div className="mx-2 my-2 border-t border-[#E7E3DC]" />
            ) : (
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#8D887F] hover:text-[#343330]"
                aria-expanded={!isClosed}
              >
                <span>{group.title}{isClosed && hasActive ? " ·" : ""}</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isClosed ? "-rotate-90" : ""}`} />
              </button>
            )}
            {!isClosed && (
              <ul className="mt-1 space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const base = `flex w-full items-center gap-2.5 rounded-xl text-left text-xs font-semibold transition ${compact ? "justify-center p-2.5" : "px-2.5 py-2"}`;
                  if (item.kind === "section") {
                    const isActive = item.id === active;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          title={compact ? item.label : undefined}
                          onClick={() => { onSelect(item.id); setMobileOpen(false); }}
                          className={`${base} ${isActive ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-[#F3F0EA]"}`}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {!compact && <span>{item.label}</span>}
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={compact ? `${item.label} (panel de ${item.note ?? "otra sección"})` : undefined}
                        className={`${base} text-slate-600 hover:bg-[#F3F0EA]`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!compact && (
                          <span className="flex-1">
                            {item.label}
                            {item.note && <span className="ml-1 font-normal text-[#8D887F]">↗ {item.note}</span>}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Móvil: botón que abre el menú como panel deslizante */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-lg lg:hidden"
      >
        <Menu className="h-4 w-4" /> Menú
      </button>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2 font-serif text-base font-bold text-[#292825]"><ShieldCheck className="h-5 w-5 text-emerald-800" /> Administración</span>
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar menú"><X className="h-4 w-4" /></button>
            </div>
            {renderNav(false)}
          </aside>
        </div>
      )}

      {/* Escritorio: barra lateral fija que se estrecha o se ensancha */}
      <aside className={`sticky top-[73px] hidden h-[calc(100vh-73px)] shrink-0 overflow-y-auto border-r border-[#E7E3DC] bg-white p-3 transition-[width] lg:block ${narrow ? "w-16" : "w-64"}`}>
        <button
          type="button"
          onClick={toggleNarrow}
          className={`mb-3 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[11px] font-semibold text-[#8D887F] hover:bg-[#F3F0EA] ${narrow ? "justify-center" : ""}`}
          title={narrow ? "Desplegar menú" : "Plegar menú"}
        >
          {narrow ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Plegar menú</>}
        </button>
        {renderNav(narrow)}
      </aside>
    </>
  );
}
