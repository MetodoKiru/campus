import { OPPORTUNITY_AREAS, type OpportunityArea } from "@/lib/growth";
import { text } from "@/lib/server/growth";

const AREA_IDS = new Set<string>(OPPORTUNITY_AREAS.map((a) => a.id));

/** Campos editables de una oportunidad, validados. Devuelve el error como texto. */
export function readOpportunityFields(body: Record<string, unknown>) {
  const title = text(body.title, 160);
  if (title.length < 3) return "Escribe el nombre del puesto o responsabilidad.";
  const area = typeof body.area === "string" && AREA_IDS.has(body.area) ? (body.area as OpportunityArea) : null;
  if (!area) return "Elige el área.";
  const deadline = typeof body.deadline === "string" && body.deadline ? body.deadline : null;
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return "La fecha límite no es válida.";
  const remuneration = text(body.remuneration, 300);
  const remunerationAuthorized = body.remunerationAuthorized === true;
  if (remunerationAuthorized && !remuneration) return "Si la remuneración está autorizada, indica cuál es.";
  const rawPositions = body.positionsCount;
  const positionsCount = rawPositions === null || rawPositions === undefined || rawPositions === "" ? null : Number(rawPositions);
  if (positionsCount !== null && (!Number.isInteger(positionsCount) || positionsCount < 1 || positionsCount > 100)) return "Indica entre 1 y 100 personas buscadas, o deja el campo vacío si aún no está definido.";
  const description = text(body.description, 4000);
  if (!description) return "Escribe una descripción.";
  return {
    title,
    area,
    description,
    functions: text(body.functions, 4000),
    requirements: text(body.requirements, 4000),
    dedication: text(body.dedication, 200),
    modality: text(body.modality, 200),
    remuneration,
    remuneration_authorized: remunerationAuthorized,
    positions_count: positionsCount,
    deadline,
  };
}
