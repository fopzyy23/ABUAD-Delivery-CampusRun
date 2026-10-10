// ============================================================
// Dropzyy — Shared HTTP helpers for Edge Functions
// ============================================================
// Provides consistent CORS, JSON responses, and error handling
// across all browser-invoked Edge Functions.
// ============================================================

// Origins are matched exactly. Deployment configuration may add legitimate
// environment-specific origins, but credentials/authorization are never sent
// with a wildcard origin.
const DEFAULT_ALLOWED_ORIGINS = [
  "https://dropzyy-staging.netlify.app",
  "https://dropzyy.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
const ALLOWED_ORIGINS: string[] = Array.from(new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...(Deno.env.get("ALLOWED_ORIGIN") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean),
]));

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-request-id",
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
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export { corsHeaders, json, handleOptions, ALLOWED_ORIGINS };
