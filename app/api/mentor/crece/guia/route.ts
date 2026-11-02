import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/require-staff";
import { requireGrowthAccess } from "@/lib/server/growth";

export const runtime = "nodejs";

/**
 * Guía «Crecer en Kiru» (el PDF que preparó dirección, tal cual) y sus dos
 * páginas en imagen para leerla en el panel también desde el móvil. Solo para
 * mentores con acceso a «Crece con Kiru». Para cambiar la guía basta con
 * sustituir los archivos de content/crecer-en-kiru/.
 */
const DIR = path.join(process.cwd(), "content", "crecer-en-kiru");
const FILES: Record<string, { file: string; type: string; download?: string }> = {
  pdf: { file: "crecer-en-kiru.pdf", type: "application/pdf", download: "Crecer en Kiru - Metodo Kiru.pdf" },
  "1": { file: "pagina-1.png", type: "image/png" },
  "2": { file: "pagina-2.png", type: "image/png" },
};

export async function GET(request: Request) {
  const auth = await requireStaff(request, ["mentor"]);
  if (!auth.ok) return auth.response;
  const blocked = await requireGrowthAccess(auth.admin, auth.user.id);
  if (blocked) return blocked;

  const which = new URL(request.url).searchParams.get("parte") ?? "pdf";
  const entry = FILES[which];
  if (!entry) return NextResponse.json({ error: "No existe esa parte de la guía." }, { status: 404 });
  try {
    const content = await readFile(path.join(DIR, entry.file));
    return new NextResponse(new Uint8Array(content), {
      headers: {
        "Content-Type": entry.type,
        "Cache-Control": "private, no-store",
        ...(entry.download ? { "Content-Disposition": `inline; filename="${entry.download}"` } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "No se encontró la guía." }, { status: 500 });
  }
}
