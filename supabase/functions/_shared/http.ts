// ============================================================
// Dropzyy — Shared HTTP helpers for Edge Functions
// ============================================================
// Provides consistent CORS, JSON responses, and error handling
// across all browser-invoked Edge Functions.
// ============================================================

// No implicit production/local origin defaults. Each deployment must provide
// its own explicit ALLOWED_ORIGIN value.
const ALLOWED_ORIGINS: string[] = (
  Deno.env.get("ALLOWED_ORIGIN") ?? ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin;
  return headers;
}

function json(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function handleOptions(req: Request): Response {
  return new Response("ok", { headers: corsHeaders(req) });
}

export { corsHeaders, json, handleOptions, ALLOWED_ORIGINS };
