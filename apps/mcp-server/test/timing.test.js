import test from "node:test";
import assert from "node:assert/strict";
import { withTimings, timeAsync, timeSync } from "../src/timing.js";
import { Telemetry } from "../src/observability.js";
test("timing captures failures, isolates concurrent traces and scopes metrics to owner", async () => {
  const one = [],
    two = [];
  await Promise.all([
    withTimings(one, () =>
      timeAsync("database.read", async () =>
        timeSync("planning.verification", () => 42),
      ),
    ),
    withTimings(two, () =>
      assert.rejects(() =>
        timeAsync("provider.Test", async () => {
          throw Error("failure");
        }),
      ),
    ),
  ]);
  assert.equal(one.length, 2);
  assert.equal(two.length, 1);
  assert.equal(two[0].status, "error");
  const telemetry = new Telemetry();
  telemetry.record({
    userId: "other",
    latencyMs: 999,
    status: "error",
    stages: two,
  });
  for (let i = 0; i < 30; i++)
    telemetry.record({
      userId: "owner",
      latencyMs: i,
      status: "success",
      stages: one,
    });
  const snapshot = telemetry.snapshot("owner");
  telemetry.recordMcp({ userId: "other", latencyMs: 999 });
  for (let i = 0; i < 20; i++)
    telemetry.recordMcp({ userId: "owner", latencyMs: i });
  assert.equal(telemetry.snapshot("owner").mcpProcessing.samples, 20);
  assert.equal(telemetry.snapshot("owner").mcpProcessing.p95Ms, 18);
  assert.equal(snapshot.calls, 30);
  assert.equal(snapshot.p95LatencyMs, 28);
  assert.ok(snapshot.recentCalls.every((row) => !row.userId));
  assert.equal(telemetry.snapshot("other").p95LatencyMs, null);
  assert.equal(telemetry.snapshot().calls, 0);
});
