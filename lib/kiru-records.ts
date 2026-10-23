import { supabase } from "@/lib/supabase";

export type KiruRecordType =
  | "settings"
  | "activity"
  | "task"
  | "notice"
  | "document"
  | "payment"
  | "progress"
  | "message";

export interface KiruRecord<T = unknown> {
  id: string;
  owner_id: string;
  record_type: KiruRecordType;
  record_key: string;
  data: T;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Debes iniciar sesión para acceder a los datos de Método Kiru.");
  }
  return data.user.id;
}

/** Reads the records allowed by the signed-in user's RLS policies. */
export async function getKiruRecords<T = unknown>(
  recordType: KiruRecordType,
): Promise<KiruRecord<T>[]> {
  await currentUserId();
  const { data, error } = await supabase
    .from("kiru_app_records")
    .select("id,owner_id,record_type,record_key,data,created_by,created_at,updated_at")
    .eq("record_type", recordType)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`No se pudieron cargar los datos (${recordType}): ${error.message}`);
  return (data ?? []) as KiruRecord<T>[];
}

/**
 * Saves a record for the signed-in user or for a requested owner that RLS permits
 * (for example, a mentor and an assigned student). The database remains the final
 * authority for ownership and relationship checks.
 */
export async function saveKiruRecord<T>(
  recordType: KiruRecordType,
  recordKey: string,
  value: T,
  requestedOwnerId?: string,
): Promise<KiruRecord<T>> {
  const userId = await currentUserId();
  const normalizedKey = recordKey.trim();
  if (!normalizedKey || normalizedKey.length > 200) {
    throw new Error("La clave del registro debe tener entre 1 y 200 caracteres.");
  }

  const ownerId = requestedOwnerId || userId;
  const { data: existing, error: lookupError } = await supabase
    .from("kiru_app_records")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("record_type", recordType)
    .eq("record_key", normalizedKey)
    .maybeSingle();

  if (lookupError) throw new Error(`No se pudo comprobar el registro: ${lookupError.message}`);

  const now = new Date().toISOString();
  const updatePayload = {
    owner_id: ownerId,
    record_type: recordType,
    record_key: normalizedKey,
    data: value,
    updated_at: now,
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("kiru_app_records")
      .update(updatePayload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(`No se pudo guardar el registro (${recordType}): ${error.message}`);
    return data as KiruRecord<T>;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("kiru_app_records")
    .insert({ ...updatePayload, created_by: userId })
    .select("*")
    .single();

  if (!insertError) return inserted as KiruRecord<T>;

  // A concurrent save may have inserted the same unique owner/type/key after our lookup.
  if (insertError.code === "23505") {
    const { data: concurrent, error: concurrentLookupError } = await supabase
      .from("kiru_app_records")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("record_type", recordType)
      .eq("record_key", normalizedKey)
      .maybeSingle();

    if (concurrentLookupError || !concurrent?.id) {
      throw new Error("El registro se estaba guardando en paralelo y no se pudo recuperar. Vuelve a intentarlo.");
    }

    const { data, error } = await supabase
      .from("kiru_app_records")
      .update(updatePayload)
      .eq("id", concurrent.id)
      .select("*")
      .single();
    if (error) throw new Error(`No se pudo guardar el registro (${recordType}): ${error.message}`);
    return data as KiruRecord<T>;
  }

  throw new Error(`No se pudo guardar el registro (${recordType}): ${insertError.message}`);
}

/** Deletes one record by its id; RLS enforces whether the user may do so. */
export async function deleteKiruRecord(id: string): Promise<void> {
  const ownerId = await currentUserId();
  const { error } = await supabase
    .from("kiru_app_records")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId);

  if (error) throw new Error(`No se pudo eliminar el registro: ${error.message}`);
}
