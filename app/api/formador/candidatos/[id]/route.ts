import { NextResponse } from "next/server";
import { requireCandidateStaff } from "@/lib/server/kiru-candidate-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = "id,source_row,name,sheet_status,phase,status,notes,instructions,next_step,calendly_url,history,last_synced_at,created_at,updated_at";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACTIONS: Record<string, {
  expectedPhase?: number;
  phase?: number;
  status?: string;
  instructions: string;
  nextStep: string;
  message: string;
  clearCalendly?: boolean;
}> = {
  aprobar_fase1: {
    expectedPhase: 1, phase: 2, status: "En revisión",
    instructions: "¡Felicidades! Has superado la revisión inicial. El siguiente paso es acceder a la formación.",
    nextStep: "ACCEDER A LA FORMACIÓN",
    message: "Supera la Fase 1 (revisión) y pasa a formación.",
  },
  aprobar_fase2: {
    expectedPhase: 2, phase: 3, status: "En revisión",
    instructions: "¡Enhorabuena! Has superado la formación. El siguiente paso es programar una entrevista personal.",
    nextStep: "PROGRAMAR ENTREVISTA",
    message: "Supera la Fase 2 (formación) y pasa a entrevistas.",
  },
  aprobar_fase3: {
    expectedPhase: 3, phase: 4, status: "En revisión",
    instructions: "¡Entrevista superada! Accede al siguiente nivel de formación sobre la metodología Kiru.",
    nextStep: "METODOLOGÍA KIRU",
    message: "Supera la Fase 3 (entrevista) y pasa a metodología.",
    clearCalendly: true,
  },
  aprobar_fase4: {
    expectedPhase: 4, phase: 5, status: "En revisión",
    instructions: "Has completado la metodología Kiru. El equipo se pondrá en contacto contigo para organizar la incorporación.",
    nextStep: "INICIAR INCORPORACIÓN",
    message: "Supera la Fase 4 (metodología) y pasa a incorporación.",
    clearCalendly: true,
  },
  aprobar_fase5: {
    expectedPhase: 5, phase: 6, status: "Activo",
    instructions: "¡Enhorabuena! Has completado el proceso de selección. El equipo coordinará los últimos pasos de tu incorporación.",
    nextStep: "PROCESO COMPLETADO",
    message: "Supera la Fase 5 y completa el proceso de selección.",
    clearCalendly: true,
  },
  descartar: {
    instructions: "El proceso de selección ha finalizado. Muchas gracias por tu tiempo.",
    nextStep: "",
    status: "No seleccionado",
    message: "Candidatura descartada.",
    clearCalendly: true,
  },
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireCandidateStaff(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Identificador de candidatura no válido." }, { status: 400 });

  const { data, error } = await auth.admin.from("kiru_candidates").select(FIELDS).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "No se pudo cargar la candidatura." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No se encontró la candidatura." }, { status: 404 });
  return NextResponse.json({ candidate: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireCandidateStaff(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Identificador de candidatura no válido." }, { status: 400 });

  let body: { action?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (action !== "guardar_observaciones" && !ACTIONS[action]) {
    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  }

  const { data: candidate, error: candidateError } = await auth.admin
    .from("kiru_candidates")
    .select(FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (candidateError) return NextResponse.json({ error: "No se pudo comprobar la candidatura." }, { status: 500 });
  if (!candidate) return NextResponse.json({ error: "No se encontró la candidatura." }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const now = new Date().toISOString();
  let historyMessage = "Observaciones actualizadas.";

  if (action === "guardar_observaciones") {
    if (typeof body.notes !== "string" || body.notes.length > 5000) {
      return NextResponse.json({ error: "Las observaciones deben ser texto y no superar 5.000 caracteres." }, { status: 400 });
    }
    updates.notes = body.notes.trim();
  } else {
    const transition = ACTIONS[action];
    if (transition.expectedPhase && Number(candidate.phase) !== transition.expectedPhase) {
      return NextResponse.json({ error: "La fase de la candidatura ha cambiado. Recarga la ficha antes de continuar." }, { status: 409 });
    }
    if (candidate.status === "No seleccionado" || candidate.status === "Activo") {
      return NextResponse.json({ error: "Esta candidatura ya ha finalizado su proceso y no admite más transiciones." }, { status: 409 });
    }

    if (action === "aprobar_fase2") {
      const { data: profile, error: profileError } = await auth.admin
        .from("profiles")
        .select("calendly_url")
        .eq("id", auth.user.id)
        .single();
      if (profileError) return NextResponse.json({ error: "No se pudo comprobar el enlace de entrevistas." }, { status: 500 });
      if (!profile?.calendly_url) {
        return NextResponse.json({ error: "Antes de pasar a entrevistas, guarda tu enlace de Calendly en el panel de formador." }, { status: 409 });
      }
      updates.calendly_url = profile.calendly_url;
    } else if (transition.clearCalendly) {
      updates.calendly_url = null;
    }

    if (transition.phase !== undefined) updates.phase = transition.phase;
    if (transition.status) updates.status = transition.status;
    updates.instructions = transition.instructions;
    updates.next_step = transition.nextStep;
    historyMessage = transition.message;
  }

  const previousHistory = Array.isArray(candidate.history) ? candidate.history : [];
  updates.history = [
    ...previousHistory,
    { at: now, actor_id: auth.user.id, action, message: historyMessage, phase: updates.phase ?? candidate.phase, status: updates.status ?? candidate.status },
  ];

  const { data: updated, error: updateError } = await auth.admin
    .from("kiru_candidates")
    .update(updates)
    .eq("id", id)
    .select(FIELDS)
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "No se pudo guardar el cambio. No se ha confirmado la operación." }, { status: 500 });
  }

  return NextResponse.json({ candidate: updated }, { headers: { "Cache-Control": "no-store" } });
}
