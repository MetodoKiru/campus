import { supabase } from "./supabase";

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

export async function listKiruRecords<T = unknown>(
  ownerId: string,
  recordType?: KiruRecordType
): Promise<KiruRecord<T>[]> {
  let query = supabase
    .from("kiru_app_records")
    .select("*")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });

  if (recordType) query = query.eq("record_type", recordType);

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron cargar los datos: ${error.message}`);
  return (data ?? []) as KiruRecord<T>[];
}

export async function saveKiruRecord<T = unknown>(input: {
  ownerId: string;
  recordType: KiruRecordType;
  recordKey: string;
  data: T;
}): Promise<KiruRecord<T>> {
  const { data, error } = await supabase
    .from("kiru_app_records")
    .upsert(
      {
        owner_id: input.ownerId,
        record_type: input.recordType,
        record_key: input.recordKey,
        data: input.data,
      },
      { onConflict: "owner_id,record_type,record_key" }
    )
    .select("*")
    .single();

  if (error) throw new Error(`No se pudieron guardar los datos: ${error.message}`);
  return data as KiruRecord<T>;
}

export async function deleteKiruRecord(
  ownerId: string,
  recordType: KiruRecordType,
  recordKey: string
): Promise<void> {
  const { error } = await supabase
    .from("kiru_app_records")
    .delete()
    .eq("owner_id", ownerId)
    .eq("record_type", recordType)
    .eq("record_key", recordKey);

  if (error) throw new Error(`No se pudieron eliminar los datos: ${error.message}`);
}
