import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MentorAvailabilityRow, OpportunityRow } from "@/lib/database.types";
import { isOpportunityOpen, type Availability, type DaySlot, type Opportunity, type OpportunityArea, type WeekDay } from "@/lib/growth";

type Admin = SupabaseClient<Database>;

/**
 * ¿Puede el mentor ver «Reuniones» y «Crece con Kiru»? La respuesta sale de la
 * base (kiru_mentor_growth_access), la misma regla que usan las políticas RLS:
 * incorporación completa o autorización expresa de administración en vigor.
 */
export async function mentorGrowthAccess(admin: Admin, mentorId: string) {
  const { data, error } = await admin.rpc("kiru_mentor_growth_access", { p_mentor: mentorId });
  if (error) return { ok: false as const, onboardingComplete: false, exceptionActive: false, unlocked: false };
  const row = Array.isArray(data) ? data[0] : null;
  const onboardingComplete = Boolean(row?.onboarding_complete);
  const exceptionActive = Boolean(row?.exception_active);
  return { ok: true as const, onboardingComplete, exceptionActive, unlocked: onboardingComplete || exceptionActive };
}

/** Corta la petición si el mentor aún no tiene acceso a estos apartados. */
export async function requireGrowthAccess(admin: Admin, mentorId: string): Promise<NextResponse | null> {
  const access = await mentorGrowthAccess(admin, mentorId);
  if (!access.ok) return NextResponse.json({ error: "No se pudo comprobar tu incorporación." }, { status: 500 });
  if (!access.unlocked) {
    return NextResponse.json({ error: "Este apartado se abre cuando completes tu incorporación." }, { status: 403 });
  }
  return null;
}

export function toAvailability(row: Pick<MentorAvailabilityRow, "days" | "slots" | "notes" | "updated_at"> | null | undefined): Availability {
  return {
    days: (row?.days ?? []) as WeekDay[],
    slots: (row?.slots ?? []) as DaySlot[],
    notes: row?.notes ?? "",
    updatedAt: row?.updated_at ?? null,
  };
}

/** Datos de la oportunidad que puede ver un mentor o un coordinador. */
export function toOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    title: row.title,
    area: row.area as OpportunityArea,
    description: row.description,
    functions: row.functions,
    requirements: row.requirements,
    dedication: row.dedication,
    modality: row.modality,
    remuneration: row.remuneration_authorized ? row.remuneration : "",
    deadline: row.deadline,
    status: row.status,
    open: isOpportunityOpen(row.status, row.deadline),
  };
}

/** Mentores de cada coordinador. Para un coordinador, solo su propio grupo. */
export async function coordinatorGroups(admin: Admin, role: string, userId: string) {
  let query = admin.from("kiru_coordinator_mentors").select("mentor_id,coordinator_id");
  if (role !== "admin") query = query.eq("coordinator_id", userId);
  const { data, error } = await query;
  if (error) return null;
  const groups = new Map<string, string[]>();
  if (role !== "admin") groups.set(userId, []);
  for (const link of data ?? []) groups.set(link.coordinator_id, [...(groups.get(link.coordinator_id) ?? []), link.mentor_id]);
  return groups;
}

/** Texto de un campo del cuerpo: recortado y con un máximo. */
export function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
}

/**
 * «2026-11-20T17:00» (hora de Madrid, como lo escribe el coordinador) → ISO en
 * UTC. Tiene en cuenta el horario de verano.
 */
export function madridLocalToIso(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (instant: number) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - instant;
  };
  let instant = wall - offsetAt(wall);
  instant = wall - offsetAt(instant);
  const result = new Date(instant);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

/** Enlace de Zoom: https y de un dominio de Zoom. */
export function validZoomUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || !/(^|\.)zoom\.(us|com)$/i.test(url.hostname) || trimmed.length > 500) return null;
    return url.toString();
  } catch { return null; }
}
