import { unavailable } from "../errors.js";

export class CircuitBreaker {
  constructor({ failureThreshold = 3, resetMs = 30_000, now = () => Date.now() } = {}) { this.failureThreshold = failureThreshold; this.resetMs = resetMs; this.now = now; this.state = "CLOSED"; this.failures = 0; this.openedAt = null; }
  async execute(operation, fallback) {
    if (this.state === "OPEN" && this.now() - this.openedAt < this.resetMs) return this.useFallback(fallback, "circuit_open");
    if (this.state === "OPEN") this.state = "HALF_OPEN";
    try { const value = await operation(); this.state = "CLOSED"; this.failures = 0; return { ...value, providerHealth: "healthy" }; }
    catch (error) { this.failures += 1; if (this.failures >= this.failureThreshold) { this.state = "OPEN"; this.openedAt = this.now(); } return this.useFallback(fallback, error.code ?? "provider_failed", error); }
  }
  async useFallback(fallback, reason, originalError) { if (!fallback) throw unavailable(originalError?.message ?? "The provider is temporarily unavailable."); const value = await fallback(); return { ...value, fallbackUsed: true, fallbackReason: reason, freshness: "fallback" }; }
}
