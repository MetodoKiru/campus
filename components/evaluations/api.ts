"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { EVAL_BUCKET } from "@/lib/evaluations";

async function token(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
  return session.access_token;
}

/** Carga /api/evaluaciones (lo que toca según el rol de quien entra). */
export function useEvaluations<T>() {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/evaluaciones", { cache: "no-store", headers: { Authorization: `Bearer ${await token()}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "No se pudieron cargar las evaluaciones.");
      setData(body as T);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las evaluaciones.");
    }
  }, []);
  useEffect(() => {
    const first = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(first);
  }, [reload]);
  return { data, error, reload };
}

export async function evalAction(body: Record<string, unknown>): Promise<{ error: string | null; data: Record<string, unknown> }> {
  try {
    const res = await fetch("/api/evaluaciones", {
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

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Sube un archivo directamente al almacén privado con un enlace firmado que da
 * el servidor (sin pasar por Vercel). Devuelve la ruta guardada.
 */
export async function uploadEvalFile(file: File, request: Record<string, unknown>): Promise<{ path?: string; error?: string }> {
  if (file.size > MAX_BYTES) return { error: "El archivo pesa más de 10 MB. Escanéalo en menor calidad o súbelo en varias fotos." };
  const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  const { error, data } = await evalAction({ ...request, mime });
  if (error) return { error };
  const path = String(data.path ?? "");
  const up = await supabase.storage.from(EVAL_BUCKET).uploadToSignedUrl(path, String(data.token ?? ""), file, { contentType: mime });
  if (up.error) return { error: "No se pudo subir el archivo. Inténtalo de nuevo." };
  return { path };
}

/** Abre un archivo (enlace firmado de 5 minutos) en otra pestaña. */
export async function openEvalFile(body: Record<string, unknown>): Promise<string | null> {
  const win = window.open("", "_blank");
  const { error, data } = await evalAction(body);
  if (error || !data.url) { win?.close(); return error ?? "No se pudo abrir el archivo."; }
  if (win) win.location.href = String(data.url);
  else window.location.href = String(data.url);
  return null;
}
