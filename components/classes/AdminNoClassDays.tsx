"use client";

import { useState } from "react";
import { CalendarOff } from "lucide-react";
import { classDateLabel, type StaffClassesData } from "@/lib/classes";
import { Empty, btnDark, btnLight, card, classAction, input, subtle, useClasses } from "./shared";

/**
 * Días sin clase de Kiru (los festivos NO se restan: solo estos días). Al
 * guardarlos se anulan las clases de ese día sin consumir sesión, se descuentan
 * de las previstas y se copian solos a la pestaña «Sin clase».
 */
export default function AdminNoClassDays({ notify }: { notify: (text: string, type: "success" | "error") => void }) {
  const { data, error, reload } = useClasses<StaffClassesData>();
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  const save = async (body: Record<string, unknown>, ok: string) => {
    const m = await classAction({ action: "dia_sin_clase", ...body });
    if (m) { notify(m, "error"); return; }
    notify(ok, "success");
    setDay(""); setReason("");
    await reload();
  };
  return (
    <section className={`${card} space-y-4`} aria-label="Días sin clase de Kiru">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><CalendarOff className="h-5 w-5" /> Días sin clase de Kiru</h2>
        <p className="text-xs text-slate-600">
          Solo los días que fija Método Kiru. Los festivos nacionales, autonómicos o locales no quitan clases. Al guardar un día, sus clases se anulan sin consumir
          sesión, no cuentan en las previstas y el día aparece en «Sin clase» con mentor y alumno vacíos.
        </p>
      </header>
      <div className="flex flex-wrap items-end gap-2">
        <input type="date" aria-label="Día" className={`${input} w-auto`} value={day} onChange={(e) => setDay(e.target.value)} />
        <input className={`${input} min-w-48 flex-1`} placeholder="Motivo (p. ej. Puente de diciembre)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        <button type="button" className={btnDark} disabled={!day || !reason.trim()} onClick={() => save({ day, reason, active: true }, "Día sin clase guardado.")}>Añadir</button>
      </div>
      {error ? <Empty>{error}</Empty> : !data ? <Empty>Cargando…</Empty> : data.noClassDays.length === 0 ? <Empty>No hay días sin clase próximos.</Empty> : (
        <ul className="space-y-2">
          {data.noClassDays.map((d) => (
            <li key={d.day} className={`${subtle} flex flex-wrap items-center justify-between gap-2 text-xs`}>
              <span className="capitalize">{classDateLabel(`${d.day}T12:00:00Z`, false)} · <span className="normal-case">{d.reason}</span></span>
              <button type="button" className={btnLight} onClick={() => save({ day: d.day, reason: "", active: false }, "Día quitado: las clases vuelven a estar programadas.")}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
