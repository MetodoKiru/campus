import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { sharedSecretStatus } from "@/lib/server/shared-secret";

export const runtime = "nodejs";

/** Un aviso que no se ha podido mandar en este tiempo ya no se manda (se ve igual en el campus). */
const PENDING_DAYS = 3;
const MAX_PER_CALL = 50;

/**
 * La llama cada pocos minutos el Apps Script de «Solicitud mentores» (misma
 * clave KIRU_ALTA_SECRET que el PIN olvidado). Devuelve los avisos de
 * recompensas para las familias que llevan correo (elección de objetivo y
 * petición de canje) con lo necesario para escribirlo. Cada aviso se entrega
 * una sola vez: se marca como enviado antes de devolverlo.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = sharedSecretStatus(request, process.env.KIRU_ALTA_SECRET);
  if (!url || !service || secret === "missing") {
    return NextResponse.json({ error: "Los avisos por correo no están configurados." }, { status: 503 });
  }
  if (secret !== "ok") return NextResponse.json({ error: "Clave no válida." }, { status: 401 });

  const admin = createClient<Database>(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const since = new Date(Date.now() - PENDING_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: pending, error } = await admin
    .from("kiru_notifications")
    .select("id,recipient_id,student_id,goal_id,kind,title")
    .eq("email_status", "pendiente")
    .gt("created_at", since)
    .order("created_at")
    .limit(MAX_PER_CALL);
  if (error) return NextResponse.json({ error: "No se pudieron leer los avisos." }, { status: 500 });
  if (!pending?.length) return NextResponse.json({ ok: true, avisos: [] });

  // Se marcan primero: aunque algo falle después, ningún correo se repite.
  const ids = pending.map((n) => n.id);
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("kiru_notifications")
    .update({ email_status: "enviado", email_sent_at: now })
    .in("id", ids)
    .eq("email_status", "pendiente")
    .select("id");
  if (claimError) return NextResponse.json({ error: "No se pudieron reservar los avisos." }, { status: 500 });
  const claimedIds = new Set((claimed ?? []).map((row) => row.id));

  const goalIds = [...new Set(pending.map((n) => n.goal_id).filter((id): id is string => !!id))];
  const profileIds = [...new Set(pending.flatMap((n) => [n.recipient_id, n.student_id]).filter((id): id is string => !!id))];
  const [goalsResult, profilesResult] = await Promise.all([
    admin.from("kiru_reward_goals").select("id,reward_name,reward_category,cost,status").in("id", goalIds.length ? goalIds : ["00000000-0000-0000-0000-000000000000"]),
    admin.from("profiles").select("id,full_name,is_active").in("id", profileIds),
  ]);
  const goals = new Map((goalsResult.data ?? []).map((g) => [g.id, g]));
  const names = new Map((profilesResult.data ?? []).map((p) => [p.id, p]));
  const balances = new Map<string, number>();
  const loginUrl = new URL("/", request.url).toString();

  const avisos: {
    email: string; familyName: string; studentName: string; kind: string; title: string;
    reward: string; category: string; cost: number; balance: number; missing: number; loginUrl: string;
  }[] = [];
  const noEmail: string[] = [];

  for (const n of pending) {
    if (!claimedIds.has(n.id)) continue;
    const goal = n.goal_id ? goals.get(n.goal_id) : undefined;
    const family = names.get(n.recipient_id);
    // Si el alumno ya retiró la elección o la familia ya respondió, no se manda.
    const stillOpen = goal && (n.kind === "objetivo_pendiente" ? goal.status === "pendiente" : goal.status === "canje_solicitado");
    if (!goal || !family?.is_active || !n.student_id || !stillOpen) { noEmail.push(n.id); continue; }
    const { data: authUser } = await admin.auth.admin.getUserById(n.recipient_id);
    const email = authUser.user?.email ?? "";
    if (!email || email.endsWith(".invalid")) { noEmail.push(n.id); continue; }
    if (!balances.has(n.student_id)) {
      const { data: summary } = await admin.rpc("kiru_skillcoin_summary", { p_student: n.student_id });
      const value = (summary ?? {}) as { balance?: unknown };
      balances.set(n.student_id, Number(value.balance) || 0);
    }
    const balance = balances.get(n.student_id) ?? 0;
    avisos.push({
      email,
      familyName: family.full_name,
      studentName: names.get(n.student_id)?.full_name ?? "Tu hijo/a",
      kind: n.kind,
      title: n.title,
      reward: goal.reward_name,
      category: goal.reward_category,
      cost: goal.cost,
      balance,
      missing: Math.max(0, goal.cost - balance),
      loginUrl,
    });
  }

  if (noEmail.length) await admin.from("kiru_notifications").update({ email_status: "sin_correo", email_sent_at: null }).in("id", noEmail);
  return NextResponse.json({ ok: true, avisos });
}
