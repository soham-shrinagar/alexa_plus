import { AppError } from "../errors.js";
import { getScenario } from "../domain/scenarios/schoolMorning.js";
import { parseRoutineGoal } from "../domain/intentParser.js";
import { compileRoutine } from "../domain/routineCompiler.js";
import { buildMicroTwin } from "../domain/microTwinBuilder.js";
import { simulateRoutine } from "../domain/constraintEngine.js";
import { repairRoutine } from "../domain/repairEngine.js";
import { reviseRoutine } from "../domain/revisionEngine.js";
import { adaptRoutine } from "../domain/runtimeEngine.js";
import { ApprovalService } from "./approvalService.js";
import { builtInHouseholds, builtInHousehold, validateHousehold } from "../domain/household.js";
import { applyRevision } from "./plannerService.js";
import { EnvironmentProvider } from "../providers/environment.js";
import { runtimeFingerprint } from "../domain/rehearsalEngine.js";

export class RehearseService {
  constructor({ repository, planner, environment = new EnvironmentProvider(), toolCatalog = [], transactional = true }) {
    this.repository = repository;
    this.planner = planner; this.environment = environment; this.toolCatalog = toolCatalog;
    this.approvals = new ApprovalService(repository);
    // One lifecycle mutation includes its evidence and audit writes. The lock
    // also prevents concurrent calls from consuming one approval twice.
    if (transactional) for (const name of ["simulate", "repair", "revise", "requestActivation", "activate", "injectEvent", "rollback"]) {
      this[name] = (userId, ...args) => repository.withUserLock(userId, (transactionRepository) => {
        const service = new RehearseService({ repository: transactionRepository, planner, environment, toolCatalog: this.toolCatalog, transactional: false });
        return service[name](userId, ...args);
      });
    }
  }

  async households(userId) { return { profiles: [...builtInHouseholds(), ...await this.repository.listHouseholds(userId)] }; }
  async household(userId, id = "school-morning") {
    const profile = builtInHousehold(id) ?? (await this.repository.listHouseholds(userId)).find((item) => item.id === id);
    if (!profile) throw new AppError("HOUSEHOLD_NOT_FOUND", "No household profile is available for that ID.", { status: 404 });
    return validateHousehold(profile);
  }
  async configureHousehold(userId, input, confirmed) {
    if (!confirmed) throw new AppError("CONFIRMATION_REQUIRED", "Explicit confirmation is required to save a household profile.", { status: 409 });
    const profile = validateHousehold(input);
    if (builtInHousehold(profile.id)) throw new AppError("RESERVED_HOUSEHOLD_ID", "Use a new ID for a custom household; built-in examples cannot be overwritten.", { status: 400 });
    return this.repository.withUserLock(userId, async (repository) => {
      const saved = await repository.saveHousehold(userId, profile);
      await repository.addAuditEvent(userId, { type: "HOUSEHOLD_CONFIGURED", details: { householdId: profile.id }, proposalId: null, activationId: null });
      return { profile: saved, message: "Saved for this user. Existing proposal snapshots were not changed." };
    });
  }

  async householdCapabilities(userId, id) {
    const profile = await this.household(userId, id);
    return { household: { id: profile.id, name: profile.name }, people: profile.people, devices: profile.devices, location: profile.location, route: profile.route, personCapabilities: ["prepare_person","depart","manual_task"] };
  }
  async householdPolicies(userId, id) { const profile = await this.household(userId, id); return { policies: profile.policies, environment: profile.environment }; }

  capabilities(scenarioId = "school-morning") {
    const scenario = requireScenario(scenarioId);
    return { scenario: { id: scenario.id, name: scenario.name, description: scenario.description }, devices: scenario.household.devices, people: scenario.household.people, environment: scenario.environment };
  }

  constraints(scenarioId = "school-morning") {
    const scenario = requireScenario(scenarioId);
    return { defaults: scenario.defaults, environment: scenario.environment, note: "These inputs seed a proposal; the compiler stores the exact constraints used with each version." };
  }

  async compile(userId, { goal, scenarioId = "school-morning", mode = "fixture", dataMode = "live", date, time, includeTraffic = false, groundedContext }) {
    if (mode === "gemini") {
      if (!this.planner) throw new AppError("LLM_NOT_CONFIGURED", "Gemini planning is not configured. Choose the fixture explicitly for an offline demo.", { status: 503 });
      const profile = await this.household(userId, scenarioId);
      // groundedContext is internal provider evidence, never exposed as a model-
      // supplied or raw MCP input. It avoids repeating an orchestrated forecast.
      const context = groundedContext ?? await this.environment.context(profile, { dataMode, date, time, includeTraffic });
      // Network calls occur outside a database transaction and never hold a user lock.
      const result = await this.planner.plan({ goal, profile, context, tools: this.toolCatalog });
      if (!result.routine) return { ...result, needsClarification: true };
      result.routine.model = this.planner.provider.model;
      const microTwin = buildMicroTwin({ household: { people: profile.people, devices: profile.devices } }, result.routine);
      return this.repository.withUserLock(userId, async (repository) => {
        const proposal = await repository.createProposal(userId, { scenarioId, goal, routine: result.routine, microTwin, context });
        await repository.addAuditEvent(userId, { proposalId: proposal.id, type: "PROPOSAL_COMPILED", details: { parser: "gemini", model: this.planner.provider.model, tasks: result.routine.extractedTasks, recommendedTools: result.routine.recommendedTools, dataMode }, activationId: null });
        return { proposal, explanation: result.explanation, planner: "gemini", evidence: context.evidence };
      });
    }
    if (mode !== "fixture") throw new AppError("INVALID_PLANNER_MODE", "Choose gemini or the explicit fixture mode.", { status: 400 });
    const scenario = requireScenario(scenarioId);
    const parsed = parseRoutineGoal(goal, scenario.defaults);
    const routine = compileRoutine(parsed, scenario);
    const microTwin = buildMicroTwin(scenario, routine);
    return this.repository.withUserLock(userId, async (repository) => {
      const proposal = await repository.createProposal(userId, { scenarioId, goal, routine, microTwin, context: routine.context });
      await repository.addAuditEvent(userId, { proposalId: proposal.id, type: "PROPOSAL_COMPILED", details: { parser: parsed.parser, assumptions: parsed.assumptions, includedEntities: microTwin.people.length + microTwin.devices.length }, activationId: null });
      return { proposal, explanation: "Explicit deterministic school fixture. No LLM or live provider was used; no device action has run.", planner: "fixture" };
    });
  }

  async reviseWithGemini(userId, proposalId, instruction) {
    const proposal = await this.repository.getProposal(userId, proposalId); assertEditable(proposal);
    if (proposal.routine.journey) throw new AppError("REPLAN_JOURNEY", "Submit the updated journey request to create a fresh provider-grounded proposal; generic revisions cannot change a calculated arrival plan.", { status: 409 });
    if (!proposal.routine.householdProfile || !this.planner) throw new AppError("LLM_REVISION_UNAVAILABLE", "Compile a Gemini proposal before using a general revision.", { status: 409 });
    const revision = await this.planner.revise({ instruction, routine: proposal.routine });
    const result = applyRevision(proposal.routine, revision, instruction);
    if (!result.routine) return { ...result, needsClarification: true };
    return this.repository.withUserLock(userId, async (repository) => {
      const current = await repository.getProposal(userId, proposalId); assertEditable(current);
      if (current.version !== proposal.version) throw new AppError("STALE_PROPOSAL", "The proposal changed while Gemini was planning. Retry against the latest version.", { status: 409 });
      const simulationResult = simulateRoutine(result.routine);
      const updated = await repository.updateProposal(userId, proposalId, { routine: result.routine, microTwin: { ...current.microTwin, constraints: result.routine.constraints }, version: current.version + 1, status: simulationResult.status === "PASSED" ? "VERIFIED" : "NEEDS_REPAIR" });
      const simulation = await repository.createSimulation(userId, simulationInput(updated, simulationResult));
      await repository.addAuditEvent(userId, { proposalId, type: "PROPOSAL_REVISED", details: { instruction, changes: result.changes, parser: "gemini" }, activationId: null });
      return { proposal: updated, simulation, changes: result.changes, explanation: result.explanation };
    });
  }

  async refreshEnvironment(userId, proposalId) {
    const proposal = await this.repository.getProposal(userId, proposalId); assertEditable(proposal);
    if (proposal.routine.journey) throw new AppError("REPLAN_JOURNEY", "Replan this journey to recalculate routing, weather, preparation and reminder together. The original remains unchanged.", { status: 409 });
    if (!proposal.routine.householdProfile || proposal.context.dataMode !== "live") throw new AppError("LIVE_CONTEXT_REQUIRED", "Compile a Gemini proposal with live data before refreshing its context.", { status: 409 });
    const context = await this.environment.context(proposal.routine.householdProfile, { dataMode: "live", date: proposal.context.planningDate, time: proposal.context.planningTime, includeTraffic: proposal.context.includeTraffic });
    return this.repository.withUserLock(userId, async (repository) => {
      const current = await repository.getProposal(userId, proposalId); assertEditable(current);
      if (current.version !== proposal.version) throw new AppError("STALE_PROPOSAL", "The proposal changed during refresh. Retry.", { status: 409 });
      const routine = { ...current.routine, context }; const result = simulateRoutine(routine);
      const updated = await repository.updateProposal(userId, proposalId, { routine, context, version: current.version + 1, status: result.status === "PASSED" ? "VERIFIED" : "NEEDS_REPAIR" });
      const simulation = await repository.createSimulation(userId, simulationInput(updated, result));
      await repository.addAuditEvent(userId, { proposalId, type: "ENVIRONMENT_REFRESHED", details: { evidence: context.evidence }, activationId: null });
      return { proposal: updated, simulation, evidence: context.evidence };
    });
  }

  async respond(userId, input) {
    if (!this.planner) throw new AppError("LLM_NOT_CONFIGURED", "Configure Gemini before using the conversational assistant.", { status: 503 });
    const proposal = input.proposalId ? await this.repository.getProposal(userId, input.proposalId) : null;
    const household = await this.household(userId, input.scenarioId ?? proposal?.scenarioId ?? "personal-day");
    const decision = await this.planner.decide({ message: input.message, proposal, household, tools: this.toolCatalog });
    if (decision.operation === "clarify" || decision.questions.length) return { reply: decision.reply, questions: decision.questions, needsClarification: true };
    const calls = {
      plan: () => this.compile(userId, { ...input, goal: input.message, mode: "gemini" }),
      simulate: () => this.simulate(userId, proposal.id), repair: () => this.repair(userId, proposal.id),
      revise: () => this.reviseWithGemini(userId, proposal.id, input.message), status: () => this.status(userId, proposal.id),
      request_approval: () => this.requestActivation(userId, proposal.id)
    };
    if (!Object.hasOwn(calls, decision.operation) || (!proposal && decision.operation !== "plan")) throw new AppError("ASSISTANT_ACTION_BLOCKED", "The assistant selected an unavailable operation. No action ran.", { status: 409 });
    const toolNames = { plan: "routine.compile", simulate: "simulation.run", repair: "routine.repair", revise: "routine.revise", status: "routine.get_status", request_approval: "routine.request_activation" };
    const result = await calls[decision.operation]();
    return { reply: decision.reply, selectedTool: toolNames[decision.operation], operation: decision.operation, result, needsClarification: result.needsClarification ?? false };
  }

  async simulate(userId, proposalId) {
    const proposal = await this.repository.getProposal(userId, proposalId);
    assertEditable(proposal);
    const result = simulateRoutine(proposal.routine, proposal.context);
    const simulation = await this.repository.createSimulation(userId, simulationInput(proposal, result));
    const updated = await this.repository.updateProposal(userId, proposalId, { status: result.status === "PASSED" ? "VERIFIED" : "NEEDS_REPAIR" });
    await this.audit(userId, proposalId, "SIMULATION_COMPLETED", { simulationId: simulation.id, status: result.status, violationCount: result.violations.length });
    return { proposal: updated, simulation, safeToActivate: result.status === "PASSED" };
  }

  async repair(userId, proposalId) {
    const proposal = await this.repository.getProposal(userId, proposalId);
    assertEditable(proposal);
    if (proposal.routine.journey) throw new AppError("REPLAN_JOURNEY", "Create a fresh journey with revised timing or contingency. A generic repair cannot rewrite its calendar calculation.", { status: 409 });
    const result = repairRoutine(proposal.routine);
    const updated = await this.repository.updateProposal(userId, proposalId, { routine: result.routine, microTwin: { ...proposal.microTwin, constraints: result.routine.constraints }, context: result.routine.context, version: proposal.version + 1, status: result.after.status === "PASSED" ? "VERIFIED" : "NEEDS_INPUT" });
    const simulation = await this.repository.createSimulation(userId, simulationInput(updated, result.after));
    await this.audit(userId, proposalId, "PROPOSAL_REPAIRED", { changes: result.changes, remainingViolations: result.after.violations.map((item) => item.code) });
    return { proposal: updated, simulation, changes: result.changes, suggestions: result.suggestions, status: result.status };
  }

  async revise(userId, proposalId, instruction) {
    const proposal = await this.repository.getProposal(userId, proposalId);
    assertEditable(proposal);
    if (proposal.routine.journey) throw new AppError("REPLAN_JOURNEY", "Replan a journey with updated inputs; fixture revisions cannot change grounded arrival timing.", { status: 409 });
    const result = reviseRoutine(proposal.routine, instruction);
    const updated = await this.repository.updateProposal(userId, proposalId, { routine: result.routine, microTwin: { ...proposal.microTwin, constraints: result.routine.constraints }, context: result.routine.context, version: proposal.version + 1, status: result.simulation.status === "PASSED" ? "VERIFIED" : "NEEDS_REPAIR" });
    const simulation = await this.repository.createSimulation(userId, simulationInput(updated, result.simulation));
    await this.audit(userId, proposalId, "PROPOSAL_REVISED", { instruction, changes: result.changes, status: result.simulation.status });
    return { proposal: updated, simulation, changes: result.changes };
  }

  async requestActivation(userId, proposalId) {
    const proposal = await this.repository.getProposal(userId, proposalId);
    assertEditable(proposal);
    const verification = simulateRoutine(proposal.routine, proposal.context);
    assertFreshContext(proposal.context);
    assertFutureJourney(proposal);
    await assertReplacement(this.repository, userId, proposal);
    if (verification.status !== "PASSED") throw new AppError("VERIFICATION_REQUIRED", "Repair and re-simulate the latest proposal before activation.", { status: 409 });
    const approval = await this.approvals.request(userId, "ACTIVATE_ROUTINE", activationPayload(proposal));
    await this.repository.updateProposal(userId, proposalId, { status: "AWAITING_APPROVAL" });
    await this.audit(userId, proposalId, "ACTIVATION_REQUESTED", { approvalId: approval.id, proposalVersion: proposal.version });
    return { approval, proposalVersion: proposal.version, impact: { devices: proposal.microTwin.devices.map((item) => item.name), steps: proposal.routine.steps.length, replacingRuntime: proposal.routine.replacement?.activationId ?? null }, message: proposal.routine.replacement ? "Review this recovery plan. Confirmation stops the previous runtime and starts this exact verified alternative together." : "Review the verified routine and explicitly confirm activation." };
  }

  async activate(userId, { proposalId, approvalId, confirmed, idempotencyKey }) {
    if (!confirmed) throw new AppError("CONFIRMATION_REQUIRED", "Explicit confirmation is required to activate a routine.", { status: 409 });
    const proposal = await this.repository.getProposal(userId, proposalId);
    const previous = await this.repository.getActivationByIdempotencyKey(userId, idempotencyKey);
    if (previous) {
      if (previous.proposalId !== proposalId || previous.proposalVersion !== proposal.version) throw new AppError("IDEMPOTENCY_CONFLICT", "That idempotency key belongs to a different proposal version.", { status: 409 });
      return { activation: previous, reused: true, message: "The original activation was returned; no action was repeated." };
    }
    assertEditable(proposal);
    assertFreshContext(proposal.context);
    assertFutureJourney(proposal);
    const replacing = await assertReplacement(this.repository, userId, proposal);
    if (simulateRoutine(proposal.routine, proposal.context).status !== "PASSED") throw new AppError("VERIFICATION_REQUIRED", "The latest proposal must pass verification before activation.", { status: 409 });
    if (await this.repository.getActiveActivationForProposal(userId, proposalId)) throw new AppError("ROUTINE_ALREADY_ACTIVE", "Roll back the existing runtime before activating another version.", { status: 409 });
    const payload = activationPayload(proposal);
    await this.approvals.approve(userId, approvalId);
    await this.approvals.consume(userId, approvalId, "ACTIVATE_ROUTINE", payload);
    if (replacing) {
      await this.repository.updateActivation(userId, replacing.id, { status: "ROLLED_BACK", rolledBackAt: new Date().toISOString(), runtimeState: { routine: null, context: replacing.snapshot.context, deviceStates: replacing.snapshot.deviceStates, lastEvent: null, restored: true } });
      await this.repository.updateProposal(userId, replacing.proposalId, { status: "ROLLED_BACK" });
      await this.audit(userId, proposalId, "PREVIOUS_RUNTIME_REPLACED", { previousActivationId: replacing.id, previousProposalId: replacing.proposalId }, replacing.id);
    }
    const deviceStates = Object.fromEntries(proposal.microTwin.devices.map((device) => [device.id, { status: "IDLE", scheduledActions: [] }]));
    const snapshot = { capturedAt: new Date().toISOString(), deviceStates: structuredClone(deviceStates), context: structuredClone(proposal.context) };
    for (const step of proposal.routine.steps) if (deviceStates[step.targetId]) {
      deviceStates[step.targetId].status = "SCHEDULED";
      deviceStates[step.targetId].scheduledActions.push(step.id);
    }
    const activation = await this.repository.createActivation(userId, { proposalId, proposalVersion: proposal.version, idempotencyKey, snapshot, runtimeState: { routine: proposal.routine, approvedRoutine: proposal.routine, context: proposal.context, deviceStates, lastEvent: null } });
    await this.repository.updateProposal(userId, proposalId, { status: "ACTIVE" });
    await this.audit(userId, proposalId, "ROUTINE_ACTIVATED", { activationId: activation.id, proposalVersion: proposal.version }, activation.id);
    return { activation, message: "Routine activated in the demo runtime. Device effects remain simulated." };
  }

  async status(userId, proposalId) {
    const proposal = await this.repository.getProposal(userId, proposalId);
    const activation = await this.repository.getActiveActivationForProposal(userId, proposalId);
    const simulation = await this.repository.latestSimulation(userId, proposalId, proposal.version);
    return { proposal, activation, simulation };
  }
  async listPlans(userId, limit = 30) {
    const rows = await this.repository.listProposals(userId, limit);
    return { plans: rows.map(proposal => ({ id: proposal.id, title: proposal.routine.title, goal: proposal.goal, status: proposal.status, version: proposal.version, scenarioId: proposal.scenarioId, updatedAt: proposal.updatedAt, kind: proposal.routine.journey ? "journey" : "household", departureTime: proposal.routine.journey?.departureTime ?? null, arrivalTime: proposal.routine.journey?.arrivalTime ?? null, parentId: proposal.routine.lineage?.parentProposalId ?? null })) };
  }

  async injectEvent(userId, activationId, event) {
    const activation = await this.repository.getActivation(userId, activationId);
    if (!["ACTIVE", "SUSPENDED"].includes(activation.status)) throw new AppError("ROUTINE_NOT_ACTIVE", "Runtime events require an active or suspended routine.", { status: 409 });
    const approvedRoutine = activation.runtimeState.approvedRoutine ?? (await this.repository.getProposal(userId, activation.proposalId)).routine;
    if (["DEVICE_UNAVAILABLE","DEVICE_RECOVERED"].includes(event.type) && !approvedRoutine.steps.some((step) => step.capability === event.capability)) throw new AppError("UNKNOWN_RUNTIME_CAPABILITY", "Choose a capability referenced by this approved routine.", { status: 400 });
    const result = adaptRoutine(activation.runtimeState.routine, event, approvedRoutine);
    const status = result.simulation.status === "PASSED" ? "ACTIVE" : "SUSPENDED";
    const deviceStates = structuredClone(activation.runtimeState.deviceStates);
    for (const [deviceId, device] of Object.entries(deviceStates)) {
      device.scheduledActions = result.routine.steps.filter((step) => step.targetId === deviceId).map((step) => step.id);
      device.status = status === "SUSPENDED" ? "SUSPENDED" : device.scheduledActions.length ? "SCHEDULED" : "IDLE";
    }
    const updated = await this.repository.updateActivation(userId, activationId, { status, runtimeState: { routine: result.routine, approvedRoutine, context: result.routine.context, deviceStates, lastEvent: event } });
    await this.repository.updateProposal(userId, activation.proposalId, { status });
    await this.repository.createSimulation(userId, { proposalId: activation.proposalId, proposalVersion: activation.proposalVersion, status: result.simulation.status, violations: result.simulation.violations, trace: result.simulation.trace, summary: { ...result.simulation.summary, runtimeEvent: event } });
    await this.audit(userId, activation.proposalId, "RUNTIME_ADAPTED", { event, changes: result.changes, status: result.simulation.status }, activationId);
    return { activation: updated, event, changes: result.changes, simulation: result.simulation };
  }

  async rollback(userId, activationId, confirmed) {
    if (!confirmed) throw new AppError("CONFIRMATION_REQUIRED", "Explicit confirmation is required to roll back an active routine.", { status: 409 });
    const activation = await this.repository.getActivation(userId, activationId);
    if (!["ACTIVE", "SUSPENDED"].includes(activation.status)) throw new AppError("ROUTINE_NOT_ACTIVE", "Only an active or suspended routine can be rolled back.", { status: 409 });
    const updated = await this.repository.updateActivation(userId, activationId, { status: "ROLLED_BACK", rolledBackAt: new Date().toISOString(), runtimeState: { routine: null, context: activation.snapshot.context, deviceStates: activation.snapshot.deviceStates, lastEvent: null, restored: true } });
    await this.repository.updateProposal(userId, activation.proposalId, { status: "ROLLED_BACK" });
    await this.audit(userId, activation.proposalId, "ROUTINE_ROLLED_BACK", { activationId, restoredSnapshot: activation.snapshot }, activationId);
    return { activation: updated, restoredSnapshot: activation.snapshot, message: "The simulated runtime was stopped and the pre-activation snapshot was restored." };
  }

  async trace(userId, proposalId) { return { events: await this.repository.listAuditEvents(userId, proposalId) }; }
  async audit(userId, proposalId, type, details, activationId = null) { return this.repository.addAuditEvent(userId, { proposalId, activationId, type, details }); }
}

function requireScenario(id) { const scenario = getScenario(id); if (!scenario) throw new AppError("SCENARIO_NOT_FOUND", `Unknown scenario: ${id}.`, { status: 404 }); return scenario; }
function activationPayload(proposal) { return { proposalId: proposal.id, proposalVersion: proposal.version, ...(proposal.routine.replacement ? { replacement: proposal.routine.replacement } : {}) }; }
function simulationInput(proposal, result) { return { proposalId: proposal.id, proposalVersion: proposal.version, status: result.status, violations: result.violations, trace: result.trace, summary: result.summary }; }
function assertEditable(proposal) {
  if (["ACTIVE", "SUSPENDED", "ROLLED_BACK"].includes(proposal.status)) throw new AppError("PROPOSAL_LOCKED", "Compile a new proposal after activation or rollback; the approved version is immutable.", { status: 409 });
}
function assertFreshContext(context) {
  if (context.dataMode !== "live") return;
  if (!context.evidence?.length || context.evidence.some(item => !Number.isFinite(Date.parse(item.retrievedAt)) || Date.now() - Date.parse(item.retrievedAt) > 900000 || Date.parse(item.retrievedAt) > Date.now() + 60000)) throw new AppError("ENVIRONMENT_STALE", "Live evidence is missing or older than 15 minutes. Refresh and reverify before approval.", { status: 409 });
}
function assertFutureJourney(proposal) {
  if (proposal.routine.journey && Date.parse(proposal.routine.journey.reminderAt) <= Date.now()) throw new AppError("PLAN_ALREADY_STARTED", "The reminder time has passed. Create a new journey before approving it.", { status: 409 });
}
async function assertReplacement(repository, userId, proposal) {
  const binding = proposal.routine.replacement;
  if (!binding) return null;
  const source = await repository.getActivation(userId, binding.activationId);
  if (!["ACTIVE", "SUSPENDED"].includes(source.status) || runtimeFingerprint(source) !== binding.runtimeHash) throw new AppError("STALE_RUNTIME", "The source runtime changed. Compare and review a new recovery alternative.", { status: 409 });
  return source;
}
