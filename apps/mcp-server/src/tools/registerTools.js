import * as z from "zod";
import { AppError } from "../errors.js";

const scenarioId = z.string().min(1).max(80).default("school-morning");
const id = z.string().uuid();
const resultText = (value) => ({ type: "text", text: JSON.stringify(value) });

export function registerTools(server, { service, telemetry }) {
  register("home.list_capabilities", "List people, devices, capabilities, and demo environment facts available to the authenticated household. Read-only and scenario-scoped.", { scenarioId }, { readOnlyHint: true }, async (input) => service.capabilities(input.scenarioId));
  register("household.get_constraints", "Read the household defaults and environmental constraints that seed a routine proposal. This does not create or execute a routine.", { scenarioId }, { readOnlyHint: true }, async (input) => service.constraints(input.scenarioId));
  register("routine.compile", "Compile a natural-language household goal into a versioned temporal routine and a just-in-time micro-twin. This creates a proposal but runs no device action.", { goal: z.string().min(20).max(2000), scenarioId }, { readOnlyHint: false, destructiveHint: false }, async (input, extra) => service.compile(user(extra), input));
  register("simulation.run", "Deterministically simulate the latest proposal version against its stored constraints. Returns a trace and violations; never activates devices.", { proposalId: id }, { readOnlyHint: false, destructiveHint: false }, async (input, extra) => service.simulate(user(extra), input.proposalId));
  register("routine.repair", "Repair automatically resolvable timing, quiet-window, power, and deadline conflicts, then re-simulate. Unresolvable value choices are returned for the user.", { proposalId: id }, { readOnlyHint: false, destructiveHint: false }, async (input, extra) => service.repair(user(extra), input.proposalId));
  register("routine.revise", "Apply an explicit natural-language user revision to a proposal and re-simulate it. The demo parser supports a Maya start-time exception while preserving other constraints.", { proposalId: id, instruction: z.string().min(8).max(500) }, { readOnlyHint: false, destructiveHint: false }, async (input, extra) => service.revise(user(extra), input.proposalId, input.instruction));
  register("routine.request_activation", "Create a short-lived, payload-bound approval for the latest verified proposal. This does not activate the routine.", { proposalId: id }, { readOnlyHint: false, destructiveHint: false }, async (input, extra) => service.requestActivation(user(extra), input.proposalId));
  register("routine.activate", "Activate exactly the approved proposal version in the simulated runtime. Requires explicit confirmation and an idempotency key.", { proposalId: id, approvalId: id, confirmed: z.boolean(), idempotencyKey: z.string().min(8).max(128) }, { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, async (input, extra) => service.activate(user(extra), input));
  register("routine.get_status", "Read the current proposal and active runtime state for one authenticated user's routine.", { proposalId: id }, { readOnlyHint: true }, async (input, extra) => service.status(user(extra), input.proposalId));
  register("routine.inject_event", "Inject a demo runtime disruption and adapt the active routine. Supports DEVICE_UNAVAILABLE, TRAVEL_DELAY, and WEATHER_CHANGED events.", { activationId: id, event: z.discriminatedUnion("type", [z.object({ type: z.literal("DEVICE_UNAVAILABLE"), capability: z.string().min(1).max(80) }), z.object({ type: z.literal("TRAVEL_DELAY"), minutes: z.number().int().min(1).max(60) }), z.object({ type: z.literal("WEATHER_CHANGED"), raining: z.boolean() })]) }, { readOnlyHint: false, destructiveHint: false }, async (input, extra) => service.injectEvent(user(extra), input.activationId, input.event));
  register("routine.rollback", "Stop an active demo routine and restore its captured pre-activation snapshot. Requires explicit confirmation.", { activationId: id, confirmed: z.boolean() }, { readOnlyHint: false, destructiveHint: true }, async (input, extra) => service.rollback(user(extra), input.activationId, input.confirmed));
  register("audit.get_trace", "Read the authenticated user's append-only lifecycle trace for a proposal, including compile, simulation, approval, adaptation, and rollback events.", { proposalId: id }, { readOnlyHint: true }, async (input, extra) => service.trace(user(extra), input.proposalId));

  function register(name, description, inputSchema, annotations, handler) {
    server.registerTool(name, { description, inputSchema, annotations }, execute(name, telemetry, handler));
  }
}

function requireScope(authInfo, scope) {
  if (!authInfo?.scopes?.includes(scope)) throw new AppError("INSUFFICIENT_SCOPE", "The token lacks the required scope.", { status: 403 });
}

function user(extra) {
  if (!extra.authInfo?.userId) throw new AppError("USER_CONTEXT_REQUIRED", "This operation requires a user access token.", { status: 403 });
  return extra.authInfo.userId;
}

function execute(name, telemetry, handler) {
  return async (args, extra) => {
    const started = performance.now();
    try {
      requireScope(extra.authInfo, "mcp:tools");
      const result = await handler(args, extra);
      telemetry.record({ requestId: extra.requestId ?? "mcp", toolName: name, userId: extra.authInfo?.userId, status: "success", latencyMs: Math.round(performance.now() - started) });
      return { content: [resultText(result)], structuredContent: result };
    } catch (error) {
      const app = error instanceof AppError ? error : new AppError("TOOL_FAILURE", "The tool could not complete the request.");
      telemetry.record({ requestId: extra.requestId ?? "mcp", toolName: name, userId: extra.authInfo?.userId, status: "error", errorCode: app.code, latencyMs: Math.round(performance.now() - started) });
      return { isError: true, content: [resultText({ error: { code: app.code, message: app.message, retryable: app.retryable } })] };
    }
  };
}
