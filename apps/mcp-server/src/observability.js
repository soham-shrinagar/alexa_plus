function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b),
    percentile = (p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  return {
    samples: sorted.length,
    minMs: sorted[0] ?? null,
    maxMs: sorted.at(-1) ?? null,
    p50Ms: sorted.length >= 20 ? percentile(0.5) : null,
    p95Ms: sorted.length >= 20 ? percentile(0.95) : null,
  };
}
export class Telemetry {
  constructor() {
    this.calls = [];
    this.mcpCalls = [];
  }
  record(entry) {
    this.calls.push({ ...entry, timestamp: new Date().toISOString() });
    if (this.calls.length > 500) this.calls.shift();
  }
  recordMcp(entry) {
    if (!entry.userId) return;
    this.mcpCalls.push(entry);
    if (this.mcpCalls.length > 500) this.mcpCalls.shift();
  }
  snapshot(userId) {
    const calls = this.calls.filter((call) => userId && call.userId === userId);
    const stageNames = [
      ...new Set(
        calls.flatMap((call) => (call.stages ?? []).map((span) => span.stage)),
      ),
    ];
    const total = distribution(calls.map((call) => call.latencyMs));
    return {
      mcpProcessing: distribution(
        this.mcpCalls
          .filter((call) => userId && call.userId === userId)
          .map((call) => call.latencyMs),
      ),
      calls: calls.length,
      successRate: calls.length
        ? calls.filter((call) => call.status === "success").length /
          calls.length
        : null,
      p50LatencyMs: total.p50Ms,
      p95LatencyMs: total.p95Ms,
      toolProcessing: total,
      stages: Object.fromEntries(
        stageNames.map((name) => [
          name,
          distribution(
            calls
              .flatMap((call) => call.stages ?? [])
              .filter((span) => span.stage === name)
              .map((span) => span.latencyMs),
          ),
        ]),
      ),
      recentCalls: calls.slice(-20).map(({ userId, ...call }) => call),
      interpretation:
        "Owner-scoped inclusive spans; overlapping stages must not be summed. Percentiles need at least 20 samples. Tool processing excludes browser/network overhead and is not an Alexa latency certification.",
    };
  }
}
export function log(event, fields = {}) {
  console.log(
    JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }),
  );
}
