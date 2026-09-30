// Fail closed unless Paystack returned an accepted response that is correlated
// to the immutable local reference and a provider transfer code.
export function classifyTransferPostResponse(response, body, expected) {
  if (!response || response.ok !== true) {
    return { kind: "ambiguous", reason: "provider did not return a successful HTTP response" };
  }
  if (body?.status !== true || !body?.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    return { kind: "ambiguous", reason: "provider response is malformed or does not confirm acceptance" };
  }

  const data = body.data;
  if (data.reference !== expected.reference ||
      typeof data.transfer_code !== "string" || data.transfer_code.length === 0 ||
      typeof data.status !== "string" || data.status.length === 0) {
    return { kind: "ambiguous", reason: "provider response is not sufficiently correlated" };
  }
  if (data.amount !== undefined &&
      (!Number.isSafeInteger(Number(data.amount)) || Number(data.amount) !== Number(expected.amountKobo))) {
    return { kind: "ambiguous", reason: "provider response amount does not match" };
  }
  if (data.currency !== undefined &&
      String(data.currency).toUpperCase() !== String(expected.currency).toUpperCase()) {
    return { kind: "ambiguous", reason: "provider response currency does not match" };
  }
  const responseRecipient = data.recipient?.recipient_code;
  if (responseRecipient !== undefined && responseRecipient !== expected.recipientCode) {
    return { kind: "ambiguous", reason: "provider response recipient does not match" };
  }

  return { kind: "correlated", data };
}
