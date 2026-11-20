"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

async function token(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
  return session.access_token;
}

/** Carga /api/periodos-especiales (opcionalmente de un periodo concreto). */
export function useSpecialPeriods<T>(periodo?: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const q = periodo ? `?periodo=${encodeURIComponent(periodo)}` : "";
      const res = await fetch(`/api/periodos-especiales${q}`, { cache: "no-store", headers: { Authorization: `Bearer ${await token()}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "No se pudieron cargar los periodos especiales.");
      setData(body as T);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los periodos especiales.");
    }
  }, [periodo]);
  useEffect(() => {
    const first = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(first);
  }, [reload]);
  return { data, error, reload };
}

/** Lanza una acción; devuelve null si va bien o el mensaje de error. */
export async function periodAction(body: Record<string, unknown>): Promise<{ error: string | null; data: Record<string, unknown> }> {
  try {
    const res = await fetch("/api/periodos-especiales", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { error: res.ok ? null : data.error ?? "No se pudo guardar.", data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar.", data: {} };
  }
}

export const euro = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
