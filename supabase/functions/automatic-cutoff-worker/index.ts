import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reportEdgeError } from "../_shared/error-reporting.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const WORKER_SECRET = Deno.env.get("AUTOMATIC_CUTOFF_WORKER_SECRET");

const CLAIM_BATCH_SIZE = 50;
const TRANSFER_BATCH_SIZE = 25;
const MAX_RETRIES = 2;
const TRANSIENT_SQL_STATES = new Set(["40P01", "40001"]);

type Counts = {
  claims_seen: number;
  claims_finalized: number;
  claims_skipped: number;
  reimbursements_retried: number;
  transfers_attempted: number;
  transient_errors: number;
  permanent_errors: number;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isTransient(error: any): boolean {
  return TRANSIENT_SQL_STATES.has(error?.code);
}

async function withTransientRetry<T>(operation: () => Promise<T>, counts: Counts): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransient(error) || attempt >= MAX_RETRIES) throw error;
      counts.transient_errors += 1;
      console.error("automatic-cutoff-worker: transient operation failure", { code: error?.code, attempt: attempt + 1 });
    }
  }
}

function recordError(counts: Counts, error: any): void {
  if (isTransient(error)) counts.transient_errors += 1;
  else counts.permanent_errors += 1;
  console.error("automatic-cutoff-worker: operation failed", { code: error?.code, message: error?.message ?? "unknown" });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !WORKER_SECRET) {
    return json(500, { error: "Server configuration error" });
  }

  const apiKey = req.headers.get("apikey");
  const authorization = req.headers.get("Authorization");
  if (apiKey !== WORKER_SECRET || (authorization && authorization !== `Bearer ${WORKER_SECRET}`)) {
    return json(401, { error: "Unauthorized" });
  }

  const body = await req.json().catch(() => ({}));
  if (Object.keys(body).length !== 0) return json(400, { error: "This worker accepts no request body" });

  const counts: Counts = {
    claims_seen: 0,
    claims_finalized: 0,
    claims_skipped: 0,
    reimbursements_retried: 0,
    transfers_attempted: 0,
    transient_errors: 0,
    permanent_errors: 0,
  };
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  console.info("automatic-cutoff-worker: start");

  try {
    const claims = await withTransientRetry(
      async () => {
        const result = await supabase.rpc("claim_automatic_8pm_cutoff_orders", { p_batch_size: CLAIM_BATCH_SIZE });
        if (result.error) throw result.error;
        return result.data;
      },
      counts,
    );

    const newClaims = Array.isArray(claims) ? claims : [];
    counts.claims_seen = newClaims.length;
    console.info("automatic-cutoff-worker: claims discovered", { count: counts.claims_seen });

    for (const claim of newClaims) {
      try {
        const data = await withTransientRetry(
          async () => {
            const result = await supabase.rpc("finalize_automatic_8pm_cutoff_claim", { p_claim_id: claim.claim_id });
            if (result.error) throw result.error;
            return result.data;
          },
          counts,
        );
        if (data?.status === "completed" || data?.status === "processing") counts.claims_finalized += 1;
        else counts.claims_skipped += 1;
      } catch (error) {
        counts.claims_skipped += 1;
        recordError(counts, error);
      }
    }

    const now = new Date().toISOString();
    const retryQueries = await Promise.all([
      supabase.from("automatic_cutoff_claims").select("id").eq("status", "failed").limit(CLAIM_BATCH_SIZE),
      supabase.from("automatic_cutoff_claims").select("id").eq("status", "processing").lte("lease_until", now).limit(CLAIM_BATCH_SIZE),
      supabase.from("automatic_cutoff_claims").select("id").eq("status", "expired").not("cancellation_id", "is", null).limit(CLAIM_BATCH_SIZE),
    ]);
    for (const result of retryQueries) {
      if (result.error) {
        recordError(counts, result.error);
        continue;
      }
      for (const claim of result.data ?? []) {
        try {
          const data = await withTransientRetry(
            async () => {
              const result = await supabase.rpc("retry_automatic_8pm_cutoff_reimbursement", { p_claim_id: claim.id });
              if (result.error) throw result.error;
              return result.data;
            },
            counts,
          );
          if (data?.retryable !== false) counts.reimbursements_retried += 1;
        } catch (error) {
          recordError(counts, error);
        }
      }
    }

    const { data: activeClaims, error: activeClaimError } = await supabase
      .from("automatic_cutoff_claims")
      .select("reimbursement_transfer_id")
      .eq("status", "processing")
      .not("cancellation_id", "is", null)
      .limit(TRANSFER_BATCH_SIZE * 2);
    if (activeClaimError) throw activeClaimError;

    const transferIds = [...new Set((activeClaims ?? [])
      .map((claim) => claim.reimbursement_transfer_id)
      .filter((id): id is string => typeof id === "string"))].slice(0, TRANSFER_BATCH_SIZE);
    if (transferIds.length > 0) {
      const { data: transfers, error: transferError } = await supabase
        .from("transfers")
        .select("id")
        .in("id", transferIds)
        .eq("transfer_kind", "customer_reimbursement")
        .eq("payee_type", "customer")
        .eq("status", "pending")
        .limit(TRANSFER_BATCH_SIZE);
      if (transferError) throw transferError;

      for (const transfer of transfers ?? []) {
        counts.transfers_attempted += 1;
        try {
          const response = await fetch(`${SUPABASE_URL}/functions/v1/automatic-cutoff-transfer`, {
            method: "POST",
            headers: {
              apikey: WORKER_SECRET,
              Authorization: `Bearer ${WORKER_SECRET}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ transfer_id: transfer.id }),
          });
          if (!response.ok) {
            const error = new Error(`automatic-cutoff-transfer returned ${response.status}`);
            if (response.status >= 500) counts.transient_errors += 1;
            else counts.permanent_errors += 1;
            console.error("automatic-cutoff-worker: transfer attempt failed", { transfer_id: transfer.id, status: response.status, message: error.message });
            await reportEdgeError(error, { action: "automatic_cutoff_worker_transfer", source: "payment", context: { transfer_id: transfer.id, status: response.status } });
          }
        } catch (error) {
          counts.transient_errors += 1;
          console.error("automatic-cutoff-worker: transfer invocation failed", { transfer_id: transfer.id, message: error instanceof Error ? error.message : "unknown" });
          await reportEdgeError(error, { action: "automatic_cutoff_worker_transfer", source: "payment", context: { transfer_id: transfer.id } });
        }
      }
    }
  } catch (error) {
    recordError(counts, error);
    await reportEdgeError(error, { action: "automatic_cutoff_worker", source: "edge_function" });
  }

  console.info("automatic-cutoff-worker: complete", counts);
  return json(200, { ok: true, ...counts });
});
