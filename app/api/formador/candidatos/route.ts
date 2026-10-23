import { createHash, createSign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireCandidateStaff } from "@/lib/server/kiru-candidate-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANDIDATE_FIELDS =
  "id,source_row,name,sheet_status,phase,status,notes,instructions,next_step,calendly_url,history,last_synced_at,created_at,updated_at";

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

async function getGoogleAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const configuredKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !configuredKey) throw new Error("GOOGLE_CONFIG_MISSING");

  const privateKey = configuredKey.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = header + "." + claims;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const assertion = unsignedToken + "." + signer.sign(privateKey).toString("base64url");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("GOOGLE_TOKEN_REQUEST_FAILED");
  const result = await response.json() as { access_token?: unknown };
  if (typeof result.access_token !== "string") throw new Error("GOOGLE_TOKEN_MISSING");
  return result.access_token;
}

async function readSheetRows(): Promise<string[][]> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "1Es3xB12WbGlXiw6Btzqbj5bPEz8U5bRf1_rEcTz25fk";
  const range = process.env.GOOGLE_SHEETS_RANGE || "'respuestas de formulario 1'!A:AZ";
  const accessToken = await getGoogleAccessToken();
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
  );
  url.searchParams.set("majorDimension", "ROWS");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("GOOGLE_SHEETS_READ_FAILED");
  const result = await response.json() as { values?: unknown };
  if (!Array.isArray(result.values)) return [];
  return result.values.filter((row): row is unknown[] => Array.isArray(row)).map((row) =>
    row.map((cell) => typeof cell === "string" ? cell : cell == null ? "" : String(cell)),
  );
}

function getCell(row: string[], index: number): string {
  return String(row[index] ?? "").trim();
}

async function loadCandidates(admin: SupabaseClient) {
  return admin
    .from("kiru_candidates")
    .select(CANDIDATE_FIELDS)
    .order("updated_at", { ascending: false });
}

export async function GET(request: Request) {
  const auth = await requireCandidateStaff(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await loadCandidates(auth.admin);
  if (error) {
    return NextResponse.json({ error: "No se pudieron cargar las candidaturas." }, { status: 500 });
  }
  return NextResponse.json({ candidates: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireCandidateStaff(request);
  if (!auth.ok) return auth.response;

  let rows: string[][];
  try {
    rows = await readSheetRows();
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = code === "GOOGLE_CONFIG_MISSING" ? 503 : 502;
    return NextResponse.json({
      error: status === 503
        ? "Falta configurar la conexión segura con Google Sheets en el servidor."
        : "No se pudo leer Google Sheets. Comprueba los permisos de la hoja y vuelve a intentarlo.",
    }, { status });
  }

  // The sheet's first row is a header. Process a bounded number of rows per request.
  const sourceRows = rows.slice(1, 2001);
  const syncedAt = new Date().toISOString();
  const seenKeys = new Set<string>();
  const payload = sourceRows.flatMap((row, index) => {
    const name = getCell(row, 3);
    if (!name || name.toLowerCase() === "desconocido" || name.toLowerCase().includes("elige pasa o no pasa")) return [];

    const sheetRow = index + 2;
    const sourceToken = getCell(row, 35);
    // Never return or persist the source token itself; hash it to create an opaque stable key.
    const sourceKey = createHash("sha256")
      .update(sourceToken ? "token:" + sourceToken : "row:" + sheetRow)
      .digest("hex");
    if (seenKeys.has(sourceKey)) return [];
    seenKeys.add(sourceKey);

    return [{
      source_key: sourceKey,
      source_row: sheetRow,
      name: name.slice(0, 180),
      sheet_status: getCell(row, 28).slice(0, 120) || null,
      last_synced_at: syncedAt,
      updated_at: syncedAt,
    }];
  });

  if (payload.length) {
    const { error } = await auth.admin
      .from("kiru_candidates")
      .upsert(payload, { onConflict: "source_key", ignoreDuplicates: false });
    if (error) {
      return NextResponse.json({
        error: "Google Sheets se ha leído, pero no se pudo sincronizar con la base de datos. No se ha confirmado la sincronización.",
      }, { status: 500 });
    }
  }

  const { data, error } = await loadCandidates(auth.admin);
  if (error) {
    return NextResponse.json({ error: "La sincronización se ejecutó, pero no se pudieron cargar las candidaturas." }, { status: 500 });
  }

  return NextResponse.json({
    candidates: data ?? [],
    synced: payload.length,
    truncated: rows.length > 2001,
    syncedAt,
  }, { headers: { "Cache-Control": "no-store" } });
}
