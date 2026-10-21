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

/** Reads only records belonging to the authenticated user (RLS applies as a second barrier). */
export async function getKiruRecords<T = unknown>(
  recordType: KiruRecordType,
): Promise<KiruRecord<T>[]> {
  const ownerId = await currentUserId();
  const { data, error } = await supabase
    .from("kiru_app_records")
    .select("id,owner_id,record_type,record_key,data,created_by,created_at,updated_at")
    .eq("owner_id", ownerId)
    .eq("record_type", recordType)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`No se pudieron cargar los datos (${recordType}): ${error.message}`);
  return (data ?? []) as KiruRecord<T>[];
}

/** Saves a record for the signed-in user; it never accepts an owner id from the UI. */
export async function saveKiruRecord<T>(
  recordType: KiruRecordType,
  recordKey: string,
  value: T,
): Promise<KiruRecord<T>> {
  const ownerId = await currentUserId();
  const { data: existing, error: lookupError } = await supabase
    .from("kiru_app_records")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("record_type", recordType)
    .eq("record_key", recordKey)
    .maybeSingle();

  if (lookupError) throw new Error(`No se pudo comprobar el registro: ${lookupError.message}`);

  const payload = {
    owner_id: ownerId,
    record_type: recordType,
    record_key: recordKey,
    data: value,
    created_by: ownerId,
    updated_at: new Date().toISOString(),
  };

  const query = existing?.id
    ? supabase.from("kiru_app_records").update(payload).eq("id", existing.id).select("*").single()
    : supabase.from("kiru_app_records").insert(payload).select("*").single();

  const { data, error } = await query;
  if (error) throw new Error(`No se pudo guardar el registro (${recordType}): ${error.message}`);
  return data as KiruRecord<T>;
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
