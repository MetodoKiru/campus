"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { fetchNotifications, markNotificationsRead, type KiruNotification } from "@/lib/skillcoins";

/** Campanita con los avisos del campus. Al abrirla se marcan como leídos. */
export default function NotificationBell({ onOpenItem }: { onOpenItem?: (item: KiruNotification) => void }) {
  const [items, setItems] = useState<KiruNotification[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    try { setItems(await fetchNotifications()); } catch { /* sin conexión: se reintenta en la próxima vuelta */ }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => { void load(); }, 0);
    const interval = window.setInterval(() => { void load(); }, 60_000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread) {
      try { await markNotificationsRead(); } catch { /* se queda sin marcar */ }
      setItems((list) => list.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={unread ? `Avisos: ${unread} sin leer` : "Avisos"}
        aria-expanded={open}
        className="relative w-9 h-9 rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] text-[#45433F] flex items-center justify-center hover:bg-[#F3F0EA] transition"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#806C50] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] max-h-96 overflow-y-auto bg-white border border-[#E7E3DC] rounded-2xl shadow-lg z-40">
          <p className="px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-[#8D887F]">Avisos</p>
          {items.length === 0 ? (
            <p className="px-4 pb-4 text-xs text-[#77736B]">No tienes avisos todavía.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); onOpenItem?.(n); }}
                    className="w-full text-left px-4 py-3 border-t border-[#F0ECE6] hover:bg-[#FAF8F5]"
                  >
                    <p className="text-xs font-semibold text-[#292825]">{n.title}</p>
                    {n.body && <p className="text-[11px] text-[#77736B] mt-0.5">{n.body}</p>}
                    <p className="text-[10px] text-[#A39E95] mt-1">{new Date(n.created_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
