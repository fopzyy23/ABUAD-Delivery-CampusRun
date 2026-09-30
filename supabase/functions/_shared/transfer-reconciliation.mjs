const terminalStatuses = new Set(["success", "failed", "reversed"]);
const inFlightStatuses = new Set(["pending", "processing", "otp", "received", "queued"]);

export function classifyVerifiedTransfer(data, expected) {
  const reference = typeof data?.reference === "string" ? data.reference : null;
  const amount = Number(data?.amount);
  const currency = typeof data?.currency === "string" ? data.currency : null;
  const recipientCode = typeof data?.recipient?.recipient_code === "string"
    ? data.recipient.recipient_code
    : null;
  const transferCode = typeof data?.transfer_code === "string" ? data.transfer_code : null;

  if (reference !== expected.reference || !Number.isSafeInteger(amount) || !currency ||
      (expected.amountKobo !== null && amount !== expected.amountKobo) ||
      (expected.currency && currency.toUpperCase() !== expected.currency.toUpperCase()) ||
      (recipientCode && expected.recipientCode && recipientCode !== expected.recipientCode) ||
      (transferCode && expected.transferCode && transferCode !== expected.transferCode)) {
    return { kind: "unknown", reason: "provider identity mismatch" };
  }

  const status = String(data?.status ?? "").toLowerCase();
  if (terminalStatuses.has(status)) return { kind: "terminal", status, amount, currency, recipientCode, transferCode };
  if (inFlightStatuses.has(status)) return { kind: "in_flight", status };
  return { kind: "unknown", reason: "provider status is not conclusive" };
}
