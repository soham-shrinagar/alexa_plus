import { AppError } from "../errors.js";

// Fixed provider URLs are built by adapters, never accepted from a model/user.
export async function httpJson(fetchImpl, url, { provider, timeoutMs = 15000, maxBytes = 262144, ...options }) {
  try {
    const response = await fetchImpl(url, { ...options, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      await response.body?.cancel();
      const code = [401,403].includes(response.status) ? "PROVIDER_AUTH_FAILED" : response.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_UNAVAILABLE";
      throw new AppError(code, `${provider} returned HTTP ${response.status}. Check credentials, access, or quota.`, { status: 503, retryable: response.status === 429 || response.status >= 500 });
    }
    if (!response.body) throw new Error("Missing response body");
    const reader = response.body.getReader();
    let bytes = 0; const chunks = [];
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error("Response too large"); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("PROVIDER_UNAVAILABLE", `${provider} did not return usable data. No synthetic result was substituted.`, { status: 503, retryable: true });
  }
}
