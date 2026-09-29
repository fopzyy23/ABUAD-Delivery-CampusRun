type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  from: (table: string) => any;
};

export type TransferExecutionResult =
  | { kind: "processing"; transfer_id: string; status: string }
  | { kind: "completed"; transfer_id: string; status: "success" | "failed" | "reversed" }
  | { kind: "rejected"; transfer_id: string; status: string; message: string }
  | { kind: "accepted"; transfer_id: string; status: "processing"; reference: string }
  | { kind: "error"; transfer_id: string; message: string; transient: boolean; stage: "database" | "paystack"; expected?: boolean };

const transientSqlStates = new Set(["40P01", "40001"]);

// Conclusive Paystack transfer statuses (per Paystack documentation)
// Only these statuses represent a final, unchangeable outcome
const CONCLUSIVE_STATUSES = new Set(["success", "failed", "reversed"]);
// Non-conclusive statuses that require reconciliation
const NON_CONCLUSIVE_STATUSES = new Set(["pending", "processing", "otp", "received", "queued"]);

export async function executeAuthoritativeTransfer(
  supabase: RpcClient,
  transferId: string,
  paystackSecretKey: string,
  log: (message: string, details?: unknown) => void = () => {},
): Promise<TransferExecutionResult> {
  const { data: prep, error: prepErr } = await supabase.rpc("claim_transfer_for_execution", {
    p_transfer_id: transferId,
  });

  if (prepErr || !prep) {
    const state = prepErr?.code;
    if (transientSqlStates.has(state)) {
      return { kind: "error", transfer_id: transferId, message: "Transient database failure", transient: true, stage: "database" };
    }
    if (prepErr) {
      const expected = /not payout-eligible|not pending|not approved|not delivered|no assigned rider|transfer not found/i.test(prepErr.message ?? "");
      return { kind: "error", transfer_id: transferId, message: "Transfer claim failed", transient: false, stage: "database", expected };
    }
    return { kind: "error", transfer_id: transferId, message: "Transfer claim returned no data", transient: false, stage: "database" };
  }

  if (prep.claim === false) {
    return { kind: "processing", transfer_id: transferId, status: prep.status ?? "processing" };
  }
  if (!prep.recipient_code || !prep.reference || !prep.amount_kobo) {
    await supabase.rpc("release_transfer_for_retry", { p_transfer_id: transferId });
    return { kind: "rejected", transfer_id: transferId, status: "pending", message: "Transfer is missing payout prerequisites" };
  }

  // Call Paystack transfer API with network error handling
  let paystackRes: Response;
  let paystackBody: any;
  try {
    const res = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: prep.amount_kobo,
        recipient: prep.recipient_code,
        reference: prep.reference,
        currency: prep.currency ?? "NGN",
        reason: `Dropzyy ${prep.transfer_kind ?? prep.payee_type} transfer`,
      }),
    });
    paystackRes = res;
    paystackBody = await paystackRes.json().catch(() => ({}));
  } catch (networkErr) {
    // Network failure - DO NOT release transfer for retry automatically
    // Preserve the reference for reconciliation; the transfer may have been created on Paystack side
    log("authoritative transfer request network error", { transfer_id: transferId, error: String(networkErr) });
    // Return error but mark as transient for potential retry
    return { kind: "error", transfer_id: transferId, message: "Network error during Paystack transfer", transient: true, stage: "paystack" };
  }

  if (!paystackRes.ok || !paystackBody?.status) {
    log("authoritative transfer request failed", { transfer_id: transferId, http_status: paystackRes.status });
    const { error: releaseErr } = await supabase.rpc("release_transfer_for_retry", { p_transfer_id: transferId });
    if (releaseErr) log("transfer release failed", { transfer_id: transferId });
    return { kind: "error", transfer_id: transferId, message: "Paystack transfer request failed", transient: true, stage: "paystack" };
  }

  const paystackStatus = paystackBody?.data?.status;
  if (!paystackStatus) {
    log("paystack response missing status", { transfer_id: transferId });
    return { kind: "error", transfer_id: transferId, message: "Paystack response missing status", transient: true, stage: "paystack" };
  }

  // Only conclusive statuses are treated as final
  if (!CONCLUSIVE_STATUSES.has(paystackStatus)) {
    // Non-conclusive status (pending, otp, processing, received, queued)
    // Mark as processing and wait for webhook
    log("paystack transfer non-conclusive status", { transfer_id: transferId, paystack_status: paystackStatus });
    const { error: recordErr } = await supabase.rpc("record_transfer_code", {
      p_transfer_id: transferId,
      p_transfer_code: paystackBody?.data?.transfer_code ?? null,
    });
    if (recordErr) {
      log("transfer code recording failed", { transfer_id: transferId });
    }
    return { kind: "processing", transfer_id: transferId, status: "processing" };
  }

  // Conclusive status - record transfer code and return result
  const { error: recordErr } = await supabase.rpc("record_transfer_code", {
    p_transfer_id: transferId,
    p_transfer_code: paystackBody?.data?.transfer_code ?? null,
  });
  if (recordErr) {
    log("transfer code recording failed", { transfer_id: transferId });
    return { kind: "processing", transfer_id: transferId, status: "processing" };
  }

  const finalStatus = paystackStatus === "success" ? "success" : paystackStatus;
  return { kind: "completed", transfer_id: transferId, status: finalStatus };
}
