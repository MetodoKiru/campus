"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

async function token(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
  return session.access_token;
}

/** Carga /api/llamadas (lo que toca según el rol de quien entra). */
export function useCalls<T>() {
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/llamadas", { cache: "no-store", headers: { Authorization: `Bearer ${await token()}` } });
      if (res.ok) setData(await res.json() as T);
    } catch { /* la tarjeta simplemente no aparece */ }
  }, []);
  useEffect(() => {
    const first = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(first);
  }, [reload]);
  return { data, reload };
}

export async function callAction(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/llamadas", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const b = await res.json().catch(() => ({}));
    return typeof b.error === "string" ? b.error : "Ha ocurrido un error.";
  } catch (e) {
    return e instanceof Error ? e.message : "Ha ocurrido un error.";
  }
}
