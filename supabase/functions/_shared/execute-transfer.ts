type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  from: (table: string) => any;
};

export type TransferExecutionResult =
  | { kind: "processing"; transfer_id: string; status: string }
  | { kind: "completed"; transfer_id: string; status: "success" }
  | { kind: "rejected"; transfer_id: string; status: string; message: string }
  | { kind: "accepted"; transfer_id: string; status: "processing"; reference: string }
  | { kind: "error"; transfer_id: string; message: string; transient: boolean; stage: "database" | "paystack"; expected?: boolean };

const transientSqlStates = new Set(["40P01", "40001"]);

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
      // Do not turn permission, connection, malformed-RPC, or constraint
      // errors into an ordinary payout rejection.
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

  const paystackRes = await fetch("https://api.paystack.co/transfer", {
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
  const paystackBody = await paystackRes.json().catch(() => ({}));
  if (!paystackRes.ok || !paystackBody?.status) {
    log("authoritative transfer request failed", { transfer_id: transferId, http_status: paystackRes.status });
    const { error: releaseErr } = await supabase.rpc("release_transfer_for_retry", { p_transfer_id: transferId });
    if (releaseErr) log("transfer release failed", { transfer_id: transferId });
    return { kind: "error", transfer_id: transferId, message: "Paystack transfer request failed", transient: true, stage: "paystack" };
  }

  const { error: recordErr } = await supabase.rpc("record_transfer_code", {
    p_transfer_id: transferId,
    p_transfer_code: paystackBody?.data?.transfer_code ?? null,
  });
  if (recordErr) {
    log("transfer code recording failed", { transfer_id: transferId });
    return { kind: "processing", transfer_id: transferId, status: "processing" };
  }
  return { kind: "accepted", transfer_id: transferId, status: "processing", reference: prep.reference };
}
