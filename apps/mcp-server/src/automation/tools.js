import { z } from "zod";
import { AppError } from "../errors.js";
import { importInput, referenceInput } from "./service.js";

export const operationSchemas = {
  list: z.object({}).strict(), import: importInput, get: referenceInput, inspect: referenceInput, preflight: referenceInput, search: referenceInput, repair: referenceInput,
  trace: referenceInput.extend({ runId: z.string().uuid(), traceId: z.number().int().positive().optional() }),
  review: referenceInput.extend({ candidateId: z.string().regex(/^[a-f0-9]{16}$/), expectedVersion: z.number().int().positive() }),
  export: referenceInput.extend({ approvalId: z.string().uuid(), expectedVersion: z.number().int().positive(), confirmed: z.literal(true) }),
  respond: referenceInput.extend({ message: z.string().trim().min(1).max(2000) }),
};
const descriptions = {
  list: "List the signed-in user's saved automation projects.",
  import: "Import supported HA YAML, selected entity snapshot, confirmed expectations and independently asserted regression scenarios. Atomically reject unsupported rules. Changes create a new version and invalidate previous approvals.",
  get: "Restore this user's project, prior source versions, conversation, replay and analysis.",
  inspect: "Inspect rules, entity state, intent, scenarios and potential read/write dependencies.",
  preflight: "Run deterministic regressions, bounded disruption search, causal counterexamples and scoped repair verification. This writes saved analysis; it sends no home commands.",
  search: "Explore finite event timings and two tie orders. Report coverage and truncation; no universal safety claim.",
  repair: "Compute minimal-vocabulary guard candidates and verify expected normal behavior plus searched disruptions. Persist reviewable evidence.",
  trace: "Retrieve a saved run or a parent-linked causal chain. Includes source action/line mapping.",
  review: "Recompute a candidate's verification and create a ten-minute owner/source/version-bound patch review. Returns before/after YAML; does not approve or install it.",
  export: "Explicitly approve a reviewed patch export. Revalidate the same source, suite and candidate; consume approval once. Never installs automations on a home.",
  respond: "Use Gemini to select a permitted inspect/preflight/repair/explain/draft/what-if/clarify workflow. Engine findings remain authoritative. Cannot approve exports or change confirmed intent.",
};
export function requireAutomationUser(authInfo) {
  if (!authInfo?.userId || !authInfo.scopes?.includes("mcp:tools")) throw new AppError("USER_CONTEXT_REQUIRED", "A user token with mcp:tools is required.", { status: 403 });
  return authInfo.userId;
}
export function publicError(error) {
  if (error instanceof z.ZodError) return { code: "INVALID_INPUT", message: "Input did not satisfy the supported contract.", issues: error.issues.slice(0, 10).map(i => ({ path: i.path.join("."), message: i.message })), status: 400 };
  if (error instanceof AppError) return { code: error.code, message: error.message, status: error.status };
  return { code: "AUTOMATION_UNAVAILABLE", message: "The operation could not finish. Check configuration and try again.", status: 503 };
}
export async function invokeAutomation(service, owner, operation, raw) {
  const schema = operationSchemas[operation];
  if (!schema) throw new AppError("UNKNOWN_OPERATION", "Unknown automation operation.", { status: 404 });
  const input = schema.parse(raw);
  return operation === "list" ? service.list(owner) : service[operation](owner, input);
}
export function registerAutomationTools(server, service) {
  for (const [operation, schema] of Object.entries(operationSchemas)) {
    server.registerTool(`automation.${operation}`, { description: descriptions[operation], inputSchema: schema.shape, annotations: { readOnlyHint: ["list", "get", "inspect", "search", "trace"].includes(operation), destructiveHint: false, openWorldHint: operation === "respond" } }, async (args, extra) => {
      try {
        const result = await invokeAutomation(service, requireAutomationUser(extra.authInfo), operation, args);
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) { return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: publicError(error) }) }] }; }
    });
  }
}
