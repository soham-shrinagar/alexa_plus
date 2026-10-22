import { createApplication } from "../apps/mcp-server/src/server.js";
import { MemoryRepository } from "../apps/mcp-server/src/repositories/memoryRepository.js";
const instance = await createApplication({
  repository: new MemoryRepository(),
  config: {
    demoMode: true,
    repositoryMode: "memory",
    publicUrl: "http://127.0.0.1:0",
    requestLimit: 1000,
  },
});
const server = await new Promise((resolve) => {
  const listener = instance.app.listen(0, "127.0.0.1", () => resolve(listener));
});
const base = `http://127.0.0.1:${server.address().port}`;
const token = instance.tokenService.issue({
  userId: "benchmark-offline",
  scopes: ["mcp:tools"],
});
let session;
let sequence = 0;
async function rpc(method, params) {
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(session
        ? { "mcp-session-id": session, "mcp-protocol-version": "2025-11-25" }
        : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++sequence, method, params }),
  });
  session = response.headers.get("mcp-session-id") ?? session;
  const data = await response.json();
  if (data.error || data.result?.isError) throw Error("Benchmark tool failed");
  return data.result?.structuredContent ?? data.result;
}
try {
  await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "offline-benchmark", version: "1" },
  });
  const initialized = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": session,
      "mcp-protocol-version": "2025-11-25",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });
  if (!initialized.ok)
    throw Error("Benchmark initialization notification failed");
  const { proposal } = await rpc("tools/call", {
    name: "routine.compile",
    arguments: {
      mode: "fixture",
      scenarioId: "school-morning",
      goal: "Leave for school by 7:45 and keep quiet before 7",
    },
  });
  const elapsed = [];
  for (let i = 0; i < 30; i++) {
    const started = performance.now();
    await rpc("tools/call", {
      name: "rehearsal.compare_set",
      arguments: {
        proposalId: proposal.id,
        scenarios: [
          { id: "expected", label: "Expected", scenario: { events: [] } },
          {
            id: "delay",
            label: "15-minute delay",
            scenario: { events: [{ type: "TRAVEL_DELAY", minutes: 15 }] },
          },
          {
            id: "rain",
            label: "Rain",
            scenario: { events: [{ type: "RAIN", raining: true }] },
          },
        ],
        candidateScenario: { events: [] },
      },
    });
    elapsed.push(performance.now() - started);
  }
  const sorted = elapsed.sort((a, b) => a - b);
  const metrics = instance.telemetry.snapshot("benchmark-offline");
  delete metrics.recentCalls;
  console.log(
    JSON.stringify(
      {
        environment:
          "offline local memory MCP; no Gemini, live provider or Neon measurement",
        samples: 30,
        clientRoundTrip: { p50Ms: sorted[14], p95Ms: sorted[28] },
        server: metrics,
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  await instance.close();
}
