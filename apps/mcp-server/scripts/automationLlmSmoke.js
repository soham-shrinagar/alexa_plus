import { existsSync, readFileSync } from "node:fs";
import { loadConfig } from "../src/config.js";
import { GeminiProvider } from "../src/providers/gemini.js";
import { MemoryAutomationStore } from "../src/automation/store.js";
import { AutomationService } from "../src/automation/service.js";
import { publicError } from "../src/automation/tools.js";

if (existsSync("apps/mcp-server/.env"))
  process.loadEnvFile("apps/mcp-server/.env");
const config = loadConfig();
if (!config.geminiApiKey)
  throw new Error("GEMINI_API_KEY is required for this opt-in provider check");
const service = new AutomationService({
  store: new MemoryAutomationStore(),
  provider: new GeminiProvider({
    apiKey: config.geminiApiKey,
    model: config.geminiModel,
    timeoutMs: config.llmTimeoutMs,
  }),
});
const source = readFileSync("automation/fixtures/override-debug.yaml", "utf8");
const snapshot = JSON.parse(
  readFileSync("automation/fixtures/override-debug.json", "utf8"),
);
const projectId = (
  await service.import("provider-smoke", {
    name: "Provider smoke",
    source,
    ...snapshot,
    confirmed: true,
  })
).workspace.id;
try {
  const response = await service.respond("provider-smoke", {
    projectId,
    message:
      "Run all the preflight tests, find how motion conflicts with manual hold, and verify a repair against normal behavior too.",
  });
  if (
    !["preflight", "repair"].includes(response.operation) ||
    !response.result.analysis?.candidates.some((c) => c.eligible)
  )
    throw new Error(
      "The model did not route the requested complete verification workflow",
    );
  console.log(
    JSON.stringify({
      passed: true,
      operation: response.operation,
      model: response.model,
      summary: response.summary,
      findingsSource: response.findingsSource,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      passed: false,
      model: config.geminiModel,
      error: publicError(error),
    }),
  );
  process.exitCode = 1;
}
