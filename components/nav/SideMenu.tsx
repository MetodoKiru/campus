"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronsLeft, ChevronsRight, Menu, X } from "lucide-react";

/**
 * Menú lateral plegable que comparten los paneles (administración, coordinación…).
 * Agrupa las páginas por tarea; cada grupo se abre o se cierra, y en escritorio
 * la barra entera se estrecha a solo iconos. En el móvil es un panel deslizante.
 * Lo que la persona deja abierto o cerrado se recuerda en su navegador.
 */

export type SideMenuItem<T extends string> =
  | { kind: "section"; id: T; label: string; icon: React.ElementType; badge?: number | string; warn?: boolean }
  | { kind: "link"; href: string; label: string; icon: React.ElementType; note?: string };

export interface SideMenuGroup<T extends string> { id: string; title: string; items: SideMenuItem<T>[] }

function readPrefs(key: string): { narrow: boolean; closed: string[] } {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return { narrow: Boolean(parsed?.narrow), closed: Array.isArray(parsed?.closed) ? parsed.closed : [] };
  } catch {
    return { narrow: false, closed: [] };
  }
}

function savePrefs(key: string, prefs: { narrow: boolean; closed: string[] }) {
  try { window.localStorage.setItem(key, JSON.stringify(prefs)); } catch { /* sin almacenamiento: no pasa nada */ }
}

export default function SideMenu<T extends string>({
  groups, active, onSelect, storageKey, title, titleIcon: TitleIcon, top,
}: {
  groups: SideMenuGroup<T>[];
  active: T;
  onSelect: (id: T) => void;
  storageKey: string;
  /** Nombre del panel en la cabecera del menú del móvil. */
  title: string;
  titleIcon: React.ElementType;
  /** Elementos sueltos encima de los grupos (p. ej. «Inicio»). */
  top?: SideMenuItem<T>[];
}) {
  const [narrow, setNarrow] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const prefs = readPrefs(storageKey);
      setNarrow(prefs.narrow);
      setClosed(prefs.closed);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  const toggleNarrow = () => {
    const next = !narrow;
    setNarrow(next);
    savePrefs(storageKey, { narrow: next, closed });
  };
  const toggleGroup = (id: string) => {
    const next = closed.includes(id) ? closed.filter((g) => g !== id) : [...closed, id];
    setClosed(next);
    savePrefs(storageKey, { narrow, closed: next });
  };

  const renderItem = (item: SideMenuItem<T>, compact: boolean) => {
    const Icon = item.icon;
    const base = `flex w-full items-center gap-2.5 rounded-xl text-left text-xs font-semibold transition ${compact ? "justify-center p-2.5" : "px-2.5 py-2"}`;
    if (item.kind === "section") {
      const isActive = item.id === active;
      const hasBadge = item.badge !== undefined && item.badge !== 0 && item.badge !== "";
      return (
        <li key={item.id}>
          <button
            type="button"
            title={compact ? item.label : undefined}
            onClick={() => { onSelect(item.id); setMobileOpen(false); }}
            className={`${base} relative ${isActive ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-[#F3F0EA]"}`}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!compact && <span className="flex-1">{item.label}</span>}
            {hasBadge && (compact ? (
              <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${item.warn ? "bg-amber-500" : "bg-slate-400"}`} />
            ) : (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? "bg-white/20 text-white" : item.warn ? "bg-amber-100 text-amber-800" : "bg-[#F3F0EA] text-[#6D6962]"}`}>{item.badge}</span>
            ))}
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
  };

  const renderNav = (compact: boolean) => (
    <nav className="space-y-3">
      {top && top.length > 0 && <ul className="space-y-0.5">{top.map((i) => renderItem(i, compact))}</ul>}
      {groups.map((group) => {
        const isClosed = !compact && closed.includes(group.id);
        const hasActive = group.items.some((i) => i.kind === "section" && i.id === active);
        const pending = group.items.some((i) => i.kind === "section" && i.warn && i.badge);
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
                <span className="flex items-center gap-1.5">
                  {group.title}{isClosed && hasActive ? " ·" : ""}
                  {isClosed && pending && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isClosed ? "-rotate-90" : ""}`} />
              </button>
            )}
            {!isClosed && <ul className="mt-1 space-y-0.5">{group.items.map((i) => renderItem(i, compact))}</ul>}
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
              <span className="flex items-center gap-2 font-serif text-base font-bold text-[#292825]"><TitleIcon className="h-5 w-5 text-emerald-800" /> {title}</span>
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
