import * as z from "zod";
import { AppError } from "../errors.js";
import { householdSchema } from "../domain/household.js";
import { weatherInputSchema, routeInputSchema } from "../providers/environment.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";

const scenarioId = z.string().min(1).max(80).default("school-morning");
// Memory uses UUIDs; Prisma's existing tables use CUIDs.
const id = z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const resultText = (value) => ({ type: "text", text: JSON.stringify(value) });

export function registerTools(server, { service, telemetry }) {
  const catalog = [];
  const planningOptions = { scenarioId, dataMode: z.enum(["live","fixture","none"]).default("live"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(), includeTraffic: z.boolean().default(false) };
  register("household.list_profiles", "List built-in school, work, and evening households plus profiles owned by this user.", {}, { readOnlyHint: true }, async (_input, extra) => service.households(user(extra)));
  register("household.configure", "Save an explicitly confirmed household profile with declared people, devices, capabilities, safety policies, coordinates, and optional route. Existing proposals retain their snapshots.", { profile: householdSchema, confirmed: z.boolean() }, { readOnlyHint: false, destructiveHint: false }, async (input, extra) => service.configureHousehold(user(extra), input.profile, input.confirmed));
  register("home.list_capabilities", "List declared people, devices, and capabilities for a household available to this authenticated user. Read-only.", { scenarioId }, { readOnlyHint: true }, async (input, extra) => service.householdCapabilities(user(extra), input.scenarioId));
  register("household.get_constraints", "Read trusted household policies. The model cannot remove or weaken these in a proposal.", { scenarioId }, { readOnlyHint: true }, async (input, extra) => service.householdPolicies(user(extra), input.scenarioId));
  register("weather.get_forecast", "Fetch a real Open-Meteo hourly forecast for coordinates and an optional local date/time; returns attribution and freshness. No key required. Never substitutes fixture weather on failure.", weatherInputSchema.shape, { readOnlyHint: true, openWorldHint: true }, async (input) => service.environment.weather(input));
  register("travel.get_estimate", "Fetch a current TomTom route and live traffic delay. Requires optional TOMTOM_API_KEY. Not a future journey-time guarantee.", routeInputSchema.shape, { readOnlyHint: true, openWorldHint: true }, async (input) => service.environment.traffic(input));
  register("assistant.respond", "Gemini reads the real tool catalog and chooses one permitted planning, verification, revision, status, or approval-request operation from a natural-language message. Cannot activate, inject events, change household policies, or roll back; human controls remain required.", { message: z.string().min(3).max(2000), proposalId: id.optional(), ...planningOptions }, { readOnlyHint: false, destructiveHint: false, openWorldHint: true }, async (input, extra) => service.respond(user(extra), input));
  register("routine.compile", "Compile a household goal into an inert versioned proposal. mode=gemini extracts tasks and validates them against the declared household and real tool catalog; mode=fixture explicitly uses the bounded school demo. Live providers fail closed.", { goal: z.string().min(10).max(2000), mode: z.enum(["gemini","fixture"]).default("fixture"), ...planningOptions }, { readOnlyHint: false, destructiveHint: false, openWorldHint: true }, async (input, extra) => service.compile(user(extra), input));
  register("simulation.run", "Deterministically simulate the latest proposal version against its stored constraints. Returns a trace and violations; never activates devices.", { proposalId: id }, { readOnlyHint: false, destructiveHint: false }, async (input, extra) => service.simulate(user(extra), input.proposalId));
  register("routine.repair", "Repair automatically resolvable timing, quiet-window, power, and deadline conflicts, then re-simulate. Unresolvable value choices are returned for the user.", { proposalId: id }, { readOnlyHint: false, destructiveHint: false }, async (input, extra) => service.repair(user(extra), input.proposalId));
  register("routine.revise", "Apply an explicit user timing revision and re-simulate. Gemini proposals support known steps and named-person earliest-start permissions; fixture proposals use the bounded Friday parser. Other safety policies cannot be relaxed.", { proposalId: id, instruction: z.string().min(8).max(500), mode: z.enum(["gemini","fixture"]).default("fixture") }, { readOnlyHint: false, destructiveHint: false, openWorldHint: true }, async (input, extra) => input.mode === "gemini" ? service.reviseWithGemini(user(extra), input.proposalId, input.instruction) : service.revise(user(extra), input.proposalId, input.instruction));
  register("routine.refresh_environment", "Refresh live weather/optional traffic on an editable proposal, increment its version, and reverify. Previous approvals become stale. Active routines require explicit disruption controls instead.", { proposalId: id }, { readOnlyHint: false, destructiveHint: false, openWorldHint: true }, async (input, extra) => service.refreshEnvironment(user(extra), input.proposalId));
  register("routine.request_activation", "Create a short-lived, payload-bound approval for the latest verified proposal. This does not activate the routine.", { proposalId: id }, { readOnlyHint: false, destructiveHint: false }, async (input, extra) => service.requestActivation(user(extra), input.proposalId));
  register("routine.activate", "Activate exactly the approved proposal version in the simulated runtime. Requires explicit confirmation and an idempotency key.", { proposalId: id, approvalId: id, confirmed: z.boolean(), idempotencyKey: z.string().min(8).max(128) }, { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, async (input, extra) => service.activate(user(extra), input));
  register("routine.get_status", "Read the current proposal and active runtime state for one authenticated user's routine.", { proposalId: id }, { readOnlyHint: true }, async (input, extra) => service.status(user(extra), input.proposalId));
  register("routine.inject_event", "Inject a clearly labelled simulated disruption/recovery into an active runtime. Required capability failure suspends it; recovery restores only approved actions and reverifies. Delay is a total, not an increment.", { activationId: id, event: z.discriminatedUnion("type", [z.object({ type: z.literal("DEVICE_UNAVAILABLE"), capability: z.string().min(1).max(80) }), z.object({ type: z.literal("DEVICE_RECOVERED"), capability: z.string().min(1).max(80) }), z.object({ type: z.literal("TRAVEL_DELAY"), minutes: z.number().int().min(0).max(60) }), z.object({ type: z.literal("WEATHER_CHANGED"), raining: z.boolean() })]) }, { readOnlyHint: false, destructiveHint: false }, async (input, extra) => service.injectEvent(user(extra), input.activationId, input.event));
  register("routine.rollback", "Stop an active demo routine and restore its captured pre-activation snapshot. Requires explicit confirmation.", { activationId: id, confirmed: z.boolean() }, { readOnlyHint: false, destructiveHint: true }, async (input, extra) => service.rollback(user(extra), input.activationId, input.confirmed));
  register("audit.get_trace", "Read the authenticated user's append-only lifecycle trace for a proposal, including compile, simulation, approval, adaptation, and rollback events.", { proposalId: id }, { readOnlyHint: true }, async (input, extra) => service.trace(user(extra), input.proposalId));

  function register(name, description, inputSchema, annotations, handler) {
    catalog.push({ name, description, inputSchema: toJsonSchemaCompat(z.object(inputSchema)), annotations });
    server.registerTool(name, { description, inputSchema, annotations }, execute(name, telemetry, handler));
  }
  service.toolCatalog = catalog;
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
      user(extra);
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
