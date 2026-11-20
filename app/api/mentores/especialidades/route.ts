import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

/**
 * El Apps Script de «Solicitud mentores» envía la lista COMPLETA de especialidades
 * validadas (Bearer KIRU_ALTA_SECRET). Se sustituye todo: quien ya no está, se borra.
 */
export async function POST(request: Request) {
  const admin = serviceClient();
  const secret = sharedSecretStatus(request, process.env.KIRU_ALTA_SECRET);
  if (!admin || secret === "missing") return NextResponse.json({ error: "No configurado." }, { status: 503 });
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  let body: { items?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  if (!Array.isArray(body.items) || body.items.length > 2000) return NextResponse.json({ error: "Lista no válida." }, { status: 400 });

  const rows = new Map<string, { email: string; specialties: string[]; hours: number; updated_at: string }>();
  const now = new Date().toISOString();
  for (const raw of body.items) {
    const item = raw as { email?: unknown; specialties?: unknown; hours?: unknown };
    const email = typeof item.email === "string" ? item.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const specialties = Array.isArray(item.specialties)
      ? item.specialties.filter((s): s is string => typeof s === "string").map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 20)
      : [];
    const hours = typeof item.hours === "number" && Number.isFinite(item.hours) && item.hours >= 0 ? item.hours : 0;
    rows.set(email, { email, specialties, hours, updated_at: now });
  }

  const { data: current, error: readError } = await admin.from("kiru_mentor_specialties").select("email");
  if (readError) return NextResponse.json({ error: "No se pudo leer." }, { status: 500 });
  const stale = (current ?? []).map((r) => r.email).filter((e) => !rows.has(e));
  if (stale.length) {
    const { error } = await admin.from("kiru_mentor_specialties").delete().in("email", stale);
    if (error) return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
  }
  if (rows.size) {
    const { error } = await admin.from("kiru_mentor_specialties").upsert([...rows.values()]);
    if (error) return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: rows.size, removed: stale.length });
}
