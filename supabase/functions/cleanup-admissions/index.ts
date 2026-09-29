import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CLEANUP_JOB_SECRET = Deno.env.get("CLEANUP_JOB_SECRET");

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authorized(req: Request): boolean {
  if (!CLEANUP_JOB_SECRET) return false;
  const apiKey = req.headers.get("apikey");
  return apiKey === CLEANUP_JOB_SECRET;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLEANUP_JOB_SECRET) {
    return json(500, { error: "Server configuration error" });
  }
  if (!authorized(req)) return json(401, { error: "Unauthorized" });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Clean up expired rate_limit_admissions (older than 24 hours)
    const { data, error } = await supabase
      .from("rate_limit_admissions")
      .delete()
      .lt("expires_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .select("id");
    if (error) throw error;
    return json(200, { ok: true, deleted_count: data?.length ?? 0 });
  } catch (err) {
    console.error("cleanup-admissions: unexpected error", err);
    return json(500, { error: "Internal server error" });
  }
});