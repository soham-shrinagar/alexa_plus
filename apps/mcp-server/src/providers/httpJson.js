import { AppError } from "../errors.js";

// Fixed provider URLs are built by adapters, never accepted from a model/user.
export async function httpJson(
  fetchImpl,
  url,
  { provider, timeoutMs = 15000, maxBytes = 262144, ...options },
) {
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    let response = await fetchImpl(url, {
      ...options,
      redirect: "error",
      signal,
    });
    // One bounded retry for transient read-only provider failures. Never retry
    // model POSTs, authentication failures, rate limits or application writes.
    if (
      (options.method ?? "GET") === "GET" &&
      [502, 503, 504].includes(response.status)
    ) {
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 350));
      response = await fetchImpl(url, {
        ...options,
        redirect: "error",
        signal,
      });
    }
    if (!response.ok) {
      await response.body?.cancel();
      const code = [401, 403].includes(response.status)
        ? "PROVIDER_AUTH_FAILED"
        : response.status === 429
          ? "PROVIDER_RATE_LIMITED"
          : "PROVIDER_UNAVAILABLE";
      const guidance =
        response.status === 429
          ? "The provider quota is busy; retry later."
          : response.status >= 500
            ? "The provider is temporarily unavailable; retry later."
            : "Check provider credentials and product access.";
      throw new AppError(
        code,
        `${provider} returned HTTP ${response.status}. ${guidance}`,
        {
          status: 503,
          retryable: response.status === 429 || response.status >= 500,
        },
      );
    }
    if (!response.body) throw new Error("Missing response body");
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error("Response too large");
      }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      `${provider} did not return usable data. No synthetic result was substituted.`,
      { status: 503, retryable: true },
    );
  }
}
