import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApplication } from "../apps/mcp-server/src/server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, "apps/mcp-server/.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.GEMINI_API_KEY)
  throw new Error(
    "Set GEMINI_API_KEY in apps/mcp-server/.env. This opt-in command makes live provider requests and may consume quota.",
  );
const instance = await createApplication({
  config: {
    repositoryMode: "memory",
    demoMode: true,
    publicUrl: "http://127.0.0.1:0",
    requestLimit: 1000,
  },
});
const listener = await new Promise((resolve) => {
  const server = instance.app.listen(0, "127.0.0.1", () => resolve(server));
});
const base = `http://127.0.0.1:${listener.address().port}`;
const token = instance.tokenService.issue({
  userId: "provider-smoke",
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
      "mcp-protocol-version": "2025-11-25",
      ...(session ? { "mcp-session-id": session } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++sequence, method, params }),
  });
  if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);
  session ??= response.headers.get("mcp-session-id");
  const message = await response.json();
  if (message.error) throw new Error(message.error.message);
  const result = message.result;
  if (method !== "tools/call") return result;
  const value = result.structuredContent ?? JSON.parse(result.content[0].text);
  if (result.isError)
    throw new Error(`${value.error.code}: ${value.error.message}`);
  return value;
}
try {
  await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "live-provider-smoke", version: "1" },
  });
  await fetch(`${base}/mcp`, {
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
  const tools = await rpc("tools/list", {});
  if (process.argv.includes("--journey")) {
    if (!process.env.TOMTOM_API_KEY)
      throw new Error(
        "Journey smoke requires TOMTOM_API_KEY. No fixture fallback.",
      );
    const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const result = await rpc("tools/call", {
      name: "planner.respond",
      arguments: {
        message:
          "Reach the selected destination by 10am on the selected date. Check weather and traffic. I need 20 minutes to get ready plus 10 minutes to pack my laptop. Plan a reminder.",
        context: {
          date,
          timezone: "Asia/Kolkata",
          origin: {
            label: "Public test: Railway Station Road, Pune",
            latitude: 18.5221,
            longitude: 73.8658,
          },
          destination: {
            label: "Public test: Baner Road, Pune",
            latitude: 18.5564,
            longitude: 73.7957,
          },
        },
      },
    });
    if (!result.proposal)
      throw new Error(
        `Planner requested clarification: ${result.questions?.join(" ")}`,
      );
    const branch = await rpc("tools/call", {
      name: "simulation.what_if",
      arguments: { proposalId: result.proposal.id, delayMinutes: 15 },
    });
    const calendar = await rpc("tools/call", {
      name: "reminder.export",
      arguments: { proposalId: result.proposal.id },
    });
    console.log(
      JSON.stringify(
        {
          tools: tools.tools.length,
          intent: result.intent.kind,
          verification: result.simulation.status,
          journey: result.proposal.routine.journey,
          whatIf: { before: branch.before.status, after: branch.after.status },
          calendarGenerated: calendar.content.includes("BEGIN:VCALENDAR"),
          reminderDelivered: false,
          storage: "memory",
          activation: "none",
        },
        null,
        2,
      ),
    );
  } else {
    const result = await rpc("tools/call", {
      name: "routine.compile",
      arguments: {
        mode: "gemini",
        scenarioId: "work-morning",
        dataMode: "live",
        time: "07:00",
        goal: "Alex needs 30 minutes to get ready starting at 7:00 and must leave for work by 7:45. Boil water for 5 minutes and toast breakfast for 4 minutes at 7:05. Announce breakfast at 6:55 for 1 minute. Both breakfast tasks are required but not departure prerequisites. Keep quiet until 7:00 and leave 10 minutes earlier if it rains. No other tasks are requested.",
      },
    });
    if (result.needsClarification)
      throw new Error(
        `Planner requested clarification: ${result.questions.join(" ")}`,
      );
    const simulation = await rpc("tools/call", {
      name: "assistant.respond",
      arguments: {
        proposalId: result.proposal.id,
        scenarioId: "work-morning",
        message:
          "Simulate the existing candidate and report the conflicts. Do not change, approve, or activate anything.",
      },
    });
    if (simulation.operation !== "simulate")
      throw new Error(
        "Assistant did not select the requested simulation operation.",
      );
    const repair = await rpc("tools/call", {
      name: "routine.repair",
      arguments: { proposalId: result.proposal.id },
    });
    const revision = await rpc("tools/call", {
      name: "routine.revise",
      arguments: {
        proposalId: result.proposal.id,
        mode: "gemini",
        instruction:
          "Move the breakfast announcement to 7:01. Keep all other step timings, household policies, and deadlines unchanged.",
      },
    });
    if (revision.needsClarification)
      throw new Error(
        `Revision requested clarification: ${revision.questions.join(" ")}`,
      );
    console.log(
      JSON.stringify(
        {
          protocol: "2025-11-25",
          toolCount: tools.tools.length,
          planner: result.planner,
          model: result.proposal.routine.model,
          taskCount: result.proposal.routine.extractedTasks.length,
          providers: result.evidence.map((item) => ({
            provider: item.provider,
            source: item.source,
            retrievedAt: item.retrievedAt,
            validFor: item.validFor,
          })),
          assistantOperation: simulation.operation,
          initialVerification: simulation.result.simulation.status,
          violations: simulation.result.simulation.violations.map(
            (item) => item.code,
          ),
          repairedVerification: repair.simulation.status,
          revisedVerification: revision.simulation.status,
          storage: "memory",
          deviceActions: "none",
        },
        null,
        2,
      ),
    );
  }
} finally {
  await instance.close();
  await new Promise((resolve) => listener.close(resolve));
}
