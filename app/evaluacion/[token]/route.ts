import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import { UUID_RE } from "@/lib/server/require-staff";
import { madridTodayIso, mentorWindow, shortEvalDate } from "@/lib/evaluations";
import { firstNameOf, jotformUrl, loadEvalSettings } from "@/lib/server/evaluations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, message: string, status = 200) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Método Kiru</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#FAF8F5;color:#292825}
main{max-width:520px;margin:12vh auto;padding:28px 24px;background:#fff;border:1px solid #E7E3DC;border-radius:16px}
h1{font-family:Georgia,serif;font-size:22px;margin:0 0 12px}p{line-height:1.55;color:#555149}a{color:#292825;font-weight:600}</style></head>
<body><main><h1>${esc(title)}</h1><p>${message}</p><p><a href="/">Ir al campus</a></p></main></body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/**
 * Enlace de los correos y del campus: /evaluacion/{token}. Comprueba que la
 * evaluación está abierta (el formulario del mentor, solo sus 5 días) y lleva al
 * formulario de Jotform con el código de la evaluación en el campo oculto.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = serviceClient();
  if (!admin) return page("No disponible", "El campus no está configurado.", 503);
  if (!UUID_RE.test(token)) return page("Enlace no válido", "Este enlace no es correcto. Entra en el campus y abre la evaluación desde tu panel.", 404);
  const { data: e } = await admin.from("kiru_evaluations").select("*").eq("token", token).maybeSingle();
  if (!e || e.target === "alumno") return page("Enlace no válido", "No encontramos esta evaluación. Entra en el campus y ábrela desde tu panel.", 404);

  const { data: student } = await admin.from("profiles").select("full_name").eq("id", e.student_id).maybeSingle();
  const kid = firstNameOf(student?.full_name ?? "");
  if (e.status === "completada") return page("¡Gracias!", `Ya hemos recibido esta evaluación de ${esc(kid)}. No hace falta rellenarla otra vez.`);
  if (e.status === "cancelada") return page("Evaluación cancelada", "Esta evaluación ya no está activa.");

  const today = madridTodayIso();
  if (e.target === "mentor") {
    const w = mentorWindow(e.due_on);
    if (today < w.opensOn) {
      return page("Todavía no está abierta", `Tu evaluación de ${esc(kid)} se abre el ${shortEvalDate(w.opensOn, true)} y se puede rellenar hasta el ${shortEvalDate(w.closesOn, true)}.`);
    }
    if (today > w.closesOn || e.status === "sin_respuesta") {
      return page("El plazo ha terminado", `El formulario de ${esc(kid)} estaba abierto del ${shortEvalDate(w.opensOn)} al ${shortEvalDate(w.closesOn)}. Si necesitas rellenarlo, pide a tu coordinador que te abra otro plazo.`);
    }
  } else if (e.status !== "abierta" && today < e.due_on) {
    return page("Todavía no está abierta", `La evaluación de ${esc(kid)} se abre el ${shortEvalDate(e.due_on, true)}. Os avisaremos por correo.`);
  }

  const settings = await loadEvalSettings(admin);
  return NextResponse.redirect(jotformUrl(settings, e, { student: student?.full_name ?? "", respondent: "" }), 302);
}
