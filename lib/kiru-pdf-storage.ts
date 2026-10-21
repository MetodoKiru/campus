import { supabase } from "@/lib/supabase";

const BUCKET = "kiru-documents";
const MAX_PDF_SIZE = 10 * 1024 * 1024;

export interface StoredKiruPdf {
  path: string;
  name: string;
  size: number;
  contentType: "application/pdf";
}

export async function uploadKiruPdf(file: File, folder = "documents"): Promise<StoredKiruPdf> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Solo se admiten archivos PDF.");
  }
  if (file.size > MAX_PDF_SIZE) throw new Error("El PDF no puede superar los 10 MB.");

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Inicia sesión para subir documentos.");

  const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${authData.user.id}/${folder}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw new Error(`No se pudo guardar el PDF: ${error.message}`);

  return { path, name: file.name, size: file.size, contentType: "application/pdf" };
}

export async function getKiruPdfUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw new Error(`No se pudo abrir el PDF: ${error?.message ?? "URL no disponible"}`);
  return data.signedUrl;
}

export async function deleteKiruPdf(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`No se pudo eliminar el PDF: ${error.message}`);
}
