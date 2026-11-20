import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server/classes";
import { UUID_RE } from "@/lib/server/require-staff";
import { madridTodayIso, mentorWindow, RATING_CRITERIA, shortEvalDate } from "@/lib/evaluations";
import { firstNameOf, jotformUrl, loadEvalSettings, notifyEval, pendingRatingMentors, supervisorsOf } from "@/lib/server/evaluations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STYLE = `body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#FAF8F5;color:#292825}
main{max-width:560px;margin:8vh auto;padding:28px 24px;background:#fff;border:1px solid #E7E3DC;border-radius:16px}
@media(max-width:600px){main{margin:16px;padding:22px 16px}}
h1{font-family:Georgia,serif;font-size:22px;margin:0 0 12px}h2{font-family:Georgia,serif;font-size:18px;margin:26px 0 4px}
p{line-height:1.55;color:#555149}a{color:#292825;font-weight:600}
fieldset{border:0;padding:0;margin:16px 0 0}legend{font-weight:600;font-size:15px;padding:0}
.hint{font-size:13px;color:#77736B;margin:2px 0 8px}
.opts{display:flex;flex-wrap:wrap;gap:6px}
.opts label{position:relative}
.opts input{position:absolute;opacity:0;width:1px;height:1px}
.opts span{display:inline-block;min-width:40px;text-align:center;padding:8px 10px;border:1px solid #E4D8C5;border-radius:10px;cursor:pointer;font-size:14px;background:#fff}
.opts input:checked+span{background:#242321;color:#fff;border-color:#242321}
.opts input:focus-visible+span{outline:2px solid #8A6D3B;outline-offset:2px}
.scale{font-size:12px;color:#77736B;margin-top:4px}
textarea{width:100%;box-sizing:border-box;min-height:80px;border:1px solid #E4D8C5;border-radius:10px;padding:10px;font:inherit;font-size:14px}
.note{background:#F6F1E8;border-radius:12px;padding:12px 14px;font-size:13px;color:#45433F}
button{margin-top:24px;background:#242321;color:#fff;border:0;border-radius:12px;padding:12px 18px;font-size:15px;font-weight:600;cursor:pointer}
.skip{display:inline-block;margin-top:14px;font-size:13px;font-weight:400;color:#77736B}`;

function html(title: string, body: string, status = 200) {
  const doc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Método Kiru</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
  return new NextResponse(doc, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

function page(title: string, message: string, status = 200) {
  return html(title, `<h1>${esc(title)}</h1><p>${message}</p><p><a href="/">Ir al campus</a></p>`, status);
}

/** Formulario corto de valoración de cada mentor (antes de pasar al de Jotform). */
function ratingPage(token: string, kid: string, mentors: { id: string; name: string }[], formPending: boolean, error = "") {
  const k = esc(kid);
  const blocks = mentors.map((m) => {
    const first = esc(firstNameOf(m.name));
    const questions = RATING_CRITERIA.map((c) => {
      const name = `${m.id}:${c.key}`;
      const opts = [1, 2, 3, 4, 5].map((n, i) =>
        `<label><input type="radio" name="${name}" value="${n}"${i === 0 ? " required" : ""}><span>${n}</span></label>`).join("");
      return `<fieldset><legend>${esc(c.label)}</legend><p class="hint">${esc(c.hint.replace("{mentor}", firstNameOf(m.name)).replace("{kid}", kid))}</p>
<div class="opts">${opts}<label><input type="radio" name="${name}" value=""><span>No lo sé</span></label></div></fieldset>`;
    }).join("");
    return `<h2>${mentors.length > 1 ? `Sobre ${first}` : `¿Cómo valoráis a ${first}?`}</h2>
<p class="scale">1 = muy mal · 2 = mal · 3 = regular · 4 = bien · 5 = muy bien</p>${questions}
<fieldset><legend>¿Algo que queráis contarnos sobre ${first}? <span class="hint">(opcional)</span></legend>
<textarea name="${m.id}:comment" maxlength="1500" placeholder="Lo que más os gusta, lo que mejoraríais…"></textarea></fieldset>`;
  }).join("");
  const names = mentors.map((m) => esc(firstNameOf(m.name))).join(" y ");
  return html("Valorad a vuestro mentor/a", `<h1>Antes de nada: ¿qué tal con ${names}?</h1>
<p>Cada 3 meses os preguntamos cómo lo está haciendo el mentor/a de ${k}. Es 1 minuto y nos ayuda a cuidar la calidad de las sesiones.</p>
<p class="note"><strong>Es confidencial.</strong> ${names} no verá vuestras respuestas una a una: las lee el equipo de coordinación de Método Kiru.</p>
${error ? `<p class="note" role="alert"><strong>${esc(error)}</strong></p>` : ""}
<form method="post" action="/evaluacion/${esc(token)}">${blocks}
<button type="submit">${formPending ? `Guardar y seguir con la evaluación de ${k}` : "Enviar valoración"}</button></form>
${formPending ? `<a class="skip" href="/evaluacion/${esc(token)}?seguir=1">Ahora no, ir directamente a la evaluación de ${k}</a>` : ""}`);
}

async function load(token: string) {
  const admin = serviceClient();
  if (!admin) return { error: page("No disponible", "El campus no está configurado.", 503) } as const;
  if (!UUID_RE.test(token)) return { error: page("Enlace no válido", "Este enlace no es correcto. Entra en el campus y abre la evaluación desde tu panel.", 404) } as const;
  const { data: e } = await admin.from("kiru_evaluations").select("*").eq("token", token).maybeSingle();
  if (!e || e.target === "alumno") return { error: page("Enlace no válido", "No encontramos esta evaluación. Entra en el campus y ábrela desde tu panel.", 404) } as const;
  const { data: student } = await admin.from("profiles").select("full_name").eq("id", e.student_id).maybeSingle();
  return { admin, e, studentName: student?.full_name ?? "", kid: firstNameOf(student?.full_name ?? "") } as const;
}

/**
 * Enlace de los correos y del campus: /evaluacion/{token}. Comprueba que la
 * evaluación está abierta (el formulario del mentor, solo sus 5 días) y lleva al
 * formulario de Jotform con el código de la evaluación en el campo oculto.
 * En las evaluaciones trimestrales de la familia, antes enseña la valoración del
 * mentor (salvo que ya esté hecha o la familia elija «Ahora no»).
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await load(token);
  if ("error" in ctx) return ctx.error;
  const { admin, e, studentName, kid } = ctx;
  const skipRating = new URL(request.url).searchParams.get("seguir") === "1";

  if (e.target === "familia" && !skipRating) {
    const mentors = await pendingRatingMentors(admin, e);
    if (mentors.length && (e.status === "completada" || e.status === "abierta")) {
      return ratingPage(token, kid, mentors, e.status === "abierta");
    }
  }

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
  return NextResponse.redirect(jotformUrl(settings, e, { student: studentName, respondent: "" }), 302);
}

/** Guarda la valoración del mentor y sigue con la evaluación (o da las gracias). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await load(token);
  if ("error" in ctx) return ctx.error;
  const { admin, e, kid } = ctx;
  const mentors = await pendingRatingMentors(admin, e);
  const next = () => (e.status === "abierta"
    ? NextResponse.redirect(new URL(`/evaluacion/${token}?seguir=1`, request.url), 303)
    : page("¡Gracias!", `Hemos guardado vuestra valoración. Nos ayuda mucho a cuidar las sesiones de ${esc(kid)}.`));
  if (!mentors.length) return next();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return ratingPage(token, kid, mentors, e.status === "abierta", "No se pudo leer el formulario. Inténtalo de nuevo.");
  }
  const score = (v: FormDataEntryValue | null) => {
    const n = Number(typeof v === "string" ? v : "");
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
  };
  const rows = mentors.map((m) => {
    const answered = RATING_CRITERIA.every((c) => form.has(`${m.id}:${c.key}`));
    const comment = String(form.get(`${m.id}:comment`) ?? "").trim().slice(0, 1500);
    return {
      answered, mentor: m,
      row: {
        evaluation_id: e.id, student_id: e.student_id, mentor_id: m.id, comment,
        puntualidad: score(form.get(`${m.id}:puntualidad`)), comunicacion: score(form.get(`${m.id}:comunicacion`)),
        efectividad: score(form.get(`${m.id}:efectividad`)), trato: score(form.get(`${m.id}:trato`)),
        profesionalidad: score(form.get(`${m.id}:profesionalidad`)),
      },
    };
  });
  if (rows.some((r) => !r.answered)) {
    return ratingPage(token, kid, mentors, e.status === "abierta", "Falta alguna respuesta. Si no lo sabéis, marcad «No lo sé».");
  }
  const { error } = await admin.from("kiru_mentor_ratings")
    .upsert(rows.map((r) => r.row), { onConflict: "evaluation_id,mentor_id", ignoreDuplicates: true });
  if (error) return ratingPage(token, kid, mentors, e.status === "abierta", "No se pudo guardar. Inténtalo de nuevo en un momento.");

  // Valoración baja (alguna pregunta con 1 o 2): aviso a Coordinación para que lo hable.
  const low = rows.filter((r) => RATING_CRITERIA.some((c) => (r.row[c.key] ?? 5) <= 2));
  if (low.length) {
    const sup = await supervisorsOf(admin, e.student_id);
    for (const r of low) {
      const weak = RATING_CRITERIA.filter((c) => (r.row[c.key] ?? 5) <= 2).map((c) => `${c.label.toLowerCase()} (${r.row[c.key]})`).join(", ");
      await notifyEval(admin, e, sup, `valoracion_baja_${r.mentor.id.slice(0, 8)}`,
        `Valoración baja de ${firstNameOf(r.mentor.name)} (familia de ${kid})`,
        `La familia de ${kid} ha puntuado bajo: ${weak}.${r.row.comment ? ` Comentario: «${r.row.comment.slice(0, 400)}»` : ""} Conviene hablarlo con la familia y con ${firstNameOf(r.mentor.name)}.`);
    }
  }
  return next();
}
