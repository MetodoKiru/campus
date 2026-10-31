import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

/**
 * La llama cada lunes el Apps Script de la hoja «Registro de sesión» (misma
 * clave KIRU_REGISTROS_SECRET que la importación de registros). Devuelve las
 * semanas sin SkillCoins de la semana pasada, con el correo del mentor y el de
 * su coordinador, para que el Apps Script mande el aviso por correo. En el
 * campus el aviso se ve solo (kiru_missing_sc_weeks); aquí no se guarda nada.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = sharedSecretStatus(request, process.env.KIRU_REGISTROS_SECRET);
  if (!url || !service || secret === "missing") {
    return NextResponse.json({ error: "Los avisos de semanas sin SC no están configurados." }, { status: 503 });
  }
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: rows, error } = await admin.rpc("kiru_missing_sc_weeks", { p_weeks: 1 });
  if (error) return NextResponse.json({ error: "No se pudieron calcular las semanas sin SC." }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ ok: true, avisos: [] });

  const mentorIds = [...new Set(rows.map((r) => r.mentor_id).filter((id): id is string => !!id))];
  const { data: links } = await admin.from("kiru_coordinator_mentors").select("mentor_id,coordinator_id")
    .in("mentor_id", mentorIds.length ? mentorIds : ["00000000-0000-0000-0000-000000000000"]);
  const emails = new Map<string, string>();
  const emailOf = async (id: string) => {
    if (!emails.has(id)) {
      const { data } = await admin.auth.admin.getUserById(id);
      const email = (data.user?.email ?? "").toLowerCase();
      emails.set(id, email.endsWith(".invalid") ? "" : email);
    }
    return emails.get(id) ?? "";
  };

  const avisos = [];
  for (const r of rows) {
    const mentorEmail = (r.mentor_id ? await emailOf(r.mentor_id) : "") || (r.respondent_email ?? "");
    const coordinators = (links ?? []).filter((l) => l.mentor_id === r.mentor_id).map((l) => l.coordinator_id);
    const coordinatorEmails = (await Promise.all(coordinators.map(emailOf))).filter(Boolean);
    avisos.push({
      week: r.week, student: r.student_name, mentor: r.mentor_name, sessions: r.sessions,
      sessionDates: r.session_dates, mentorEmail, coordinatorEmails,
    });
  }
  return NextResponse.json({ ok: true, avisos });
}
