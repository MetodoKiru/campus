"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Llamada al servidor con la sesión del usuario. */
export async function familyApi<T>(path: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Tu sesión ha caducado. Vuelve a entrar.");
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "No se pudo completar la acción.");
  return json as T;
}

/** Carga datos de una ruta del campus. */
export function useFamilyApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try { setData(await familyApi<T>(path)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar."); }
  }, [path]);
  useEffect(() => {
    let alive = true;
    familyApi<T>(path).then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : "No se pudo cargar."); });
    return () => { alive = false; };
  }, [path]);
  return { data, error, reload };
}
