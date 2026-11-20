"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { COORDINATOR_GUIDE_DOC, COORDINATOR_GUIDE_VERSION } from "@/components/coordination/CoordinatorGuide";
import { errorMessage } from "@/lib/desempeno";

type Row = { id: string; name: string; acceptedAt: string | null };

/** Qué coordinadores han aceptado la guía de su función (versión actual). Solo Administración. */
export default function AdminCoordinatorCommitments() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: people, error: e1 }, { data: accepted, error: e2 }] = await Promise.all([
        supabase.from("profiles").select("id,full_name").eq("role", "coordinador").eq("is_active", true).order("full_name"),
        supabase.from("kiru_role_commitments").select("user_id,accepted_at").eq("document", COORDINATOR_GUIDE_DOC).eq("version", COORDINATOR_GUIDE_VERSION),
      ]);
      if (!alive) return;
      if (e1 || e2) { setError(errorMessage(e1 ?? e2, "No se pudo cargar.")); return; }
      const at = new Map(((accepted ?? []) as { user_id: string; accepted_at: string }[]).map((a) => [a.user_id, a.accepted_at]));
      setRows(((people ?? []) as { id: string; full_name: string }[]).map((p) => ({ id: p.id, name: p.full_name, acceptedAt: at.get(p.id) ?? null })));
    })();
    return () => { alive = false; };
  }, []);

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Guía del coordinador: compromiso aceptado</h3>
      <p className="text-xs text-slate-500">Cada coordinador la ve al entrar en su panel y no puede empezar hasta aceptarla.</p>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {rows && rows.length === 0 && <p className="text-xs text-slate-500">No hay coordinadores activos.</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-slate-100 text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span className="font-semibold text-slate-800">{r.name}</span>
              {r.acceptedAt
                ? <span className="text-emerald-700">Aceptada el {new Date(r.acceptedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</span>
                : <span className="text-amber-700">Pendiente</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
