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

export class RehearseService {
  constructor({ repository, transactional = true }) {
    this.repository = repository;
    this.approvals = new ApprovalService(repository);
    // One lifecycle mutation includes its evidence and audit writes. The lock
    // also prevents concurrent calls from consuming one approval twice.
    if (transactional) for (const name of ["compile", "simulate", "repair", "revise", "requestActivation", "activate", "injectEvent", "rollback"]) {
      this[name] = (userId, ...args) => repository.withUserLock(userId, (transactionRepository) => {
        const service = new RehearseService({ repository: transactionRepository, transactional: false });
        return service[name](userId, ...args);
      });
    }
  }

  capabilities(scenarioId = "school-morning") {
    const scenario = requireScenario(scenarioId);
    return { scenario: { id: scenario.id, name: scenario.name, description: scenario.description }, devices: scenario.household.devices, people: scenario.household.people, environment: scenario.environment };
  }

  constraints(scenarioId = "school-morning") {
    const scenario = requireScenario(scenarioId);
    return { defaults: scenario.defaults, environment: scenario.environment, note: "These inputs seed a proposal; the compiler stores the exact constraints used with each version." };
  }

  async compile(userId, { goal, scenarioId = "school-morning" }) {
    const scenario = requireScenario(scenarioId);
    const parsed = parseRoutineGoal(goal, scenario.defaults);
    const routine = compileRoutine(parsed, scenario);
    const microTwin = buildMicroTwin(scenario, routine);
    const proposal = await this.repository.createProposal(userId, { scenarioId, goal, routine, microTwin, context: routine.context });
    await this.audit(userId, proposal.id, "PROPOSAL_COMPILED", { parser: parsed.parser, assumptions: parsed.assumptions, includedEntities: microTwin.people.length + microTwin.devices.length });
    return { proposal, explanation: "Compiled a deterministic candidate and a proposal-scoped micro-twin. No device action has run." };
  }

  async simulate(userId, proposalId) {
    const proposal = await this.repository.getProposal(userId, proposalId);
    assertEditable(proposal);
    const result = simulateRoutine(proposal.routine, proposal.context);
    const simulation = await this.repository.createSimulation(userId, simulationInput(proposal, result));
    await this.repository.updateProposal(userId, proposalId, { status: result.status === "PASSED" ? "VERIFIED" : "NEEDS_REPAIR" });
    await this.audit(userId, proposalId, "SIMULATION_COMPLETED", { simulationId: simulation.id, status: result.status, violationCount: result.violations.length });
    return { simulation, safeToActivate: result.status === "PASSED" };
  }

  async repair(userId, proposalId) {
    const proposal = await this.repository.getProposal(userId, proposalId);
    assertEditable(proposal);
    const result = repairRoutine(proposal.routine);
    const updated = await this.repository.updateProposal(userId, proposalId, { routine: result.routine, microTwin: { ...proposal.microTwin, constraints: result.routine.constraints }, context: result.routine.context, version: proposal.version + 1, status: result.after.status === "PASSED" ? "VERIFIED" : "NEEDS_INPUT" });
    const simulation = await this.repository.createSimulation(userId, simulationInput(updated, result.after));
    await this.audit(userId, proposalId, "PROPOSAL_REPAIRED", { changes: result.changes, remainingViolations: result.after.violations.map((item) => item.code) });
    return { proposal: updated, simulation, changes: result.changes, suggestions: result.suggestions, status: result.status };
  }

  async revise(userId, proposalId, instruction) {
    const proposal = await this.repository.getProposal(userId, proposalId);
    assertEditable(proposal);
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
    if (verification.status !== "PASSED") throw new AppError("VERIFICATION_REQUIRED", "Repair and re-simulate the latest proposal before activation.", { status: 409 });
    const approval = await this.approvals.request(userId, "ACTIVATE_ROUTINE", activationPayload(proposal));
    await this.repository.updateProposal(userId, proposalId, { status: "AWAITING_APPROVAL" });
    await this.audit(userId, proposalId, "ACTIVATION_REQUESTED", { approvalId: approval.id, proposalVersion: proposal.version });
    return { approval, proposalVersion: proposal.version, impact: { devices: proposal.microTwin.devices.map((item) => item.name), steps: proposal.routine.steps.length }, message: "Review the verified routine and explicitly confirm activation." };
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
    if (simulateRoutine(proposal.routine, proposal.context).status !== "PASSED") throw new AppError("VERIFICATION_REQUIRED", "The latest proposal must pass verification before activation.", { status: 409 });
    if (await this.repository.getActiveActivationForProposal(userId, proposalId)) throw new AppError("ROUTINE_ALREADY_ACTIVE", "Roll back the existing runtime before activating another version.", { status: 409 });
    const payload = activationPayload(proposal);
    await this.approvals.approve(userId, approvalId);
    await this.approvals.consume(userId, approvalId, "ACTIVATE_ROUTINE", payload);
    const deviceStates = Object.fromEntries(proposal.microTwin.devices.map((device) => [device.id, { status: "IDLE", scheduledActions: [] }]));
    const snapshot = { capturedAt: new Date().toISOString(), deviceStates: structuredClone(deviceStates), context: structuredClone(proposal.context) };
    for (const step of proposal.routine.steps) if (deviceStates[step.targetId]) {
      deviceStates[step.targetId].status = "SCHEDULED";
      deviceStates[step.targetId].scheduledActions.push(step.id);
    }
    const activation = await this.repository.createActivation(userId, { proposalId, proposalVersion: proposal.version, idempotencyKey, snapshot, runtimeState: { routine: proposal.routine, context: proposal.context, deviceStates, lastEvent: null } });
    await this.repository.updateProposal(userId, proposalId, { status: "ACTIVE" });
    await this.audit(userId, proposalId, "ROUTINE_ACTIVATED", { activationId: activation.id, proposalVersion: proposal.version }, activation.id);
    return { activation, message: "Routine activated in the demo runtime. Device effects remain simulated." };
  }

  async status(userId, proposalId) {
    const proposal = await this.repository.getProposal(userId, proposalId);
    const activation = await this.repository.getActiveActivationForProposal(userId, proposalId);
    return { proposal, activation };
  }

  async injectEvent(userId, activationId, event) {
    const activation = await this.repository.getActivation(userId, activationId);
    if (!["ACTIVE", "SUSPENDED"].includes(activation.status)) throw new AppError("ROUTINE_NOT_ACTIVE", "Runtime events require an active or suspended routine.", { status: 409 });
    const result = adaptRoutine(activation.runtimeState.routine, event);
    const status = result.simulation.status === "PASSED" ? "ACTIVE" : "SUSPENDED";
    const deviceStates = structuredClone(activation.runtimeState.deviceStates);
    for (const [deviceId, device] of Object.entries(deviceStates)) {
      device.scheduledActions = result.routine.steps.filter((step) => step.targetId === deviceId).map((step) => step.id);
      device.status = status === "SUSPENDED" ? "SUSPENDED" : device.scheduledActions.length ? "SCHEDULED" : "IDLE";
    }
    const updated = await this.repository.updateActivation(userId, activationId, { status, runtimeState: { routine: result.routine, context: result.routine.context, deviceStates, lastEvent: event } });
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
function activationPayload(proposal) { return { proposalId: proposal.id, proposalVersion: proposal.version }; }
function simulationInput(proposal, result) { return { proposalId: proposal.id, proposalVersion: proposal.version, status: result.status, violations: result.violations, trace: result.trace, summary: result.summary }; }
function assertEditable(proposal) {
  if (["ACTIVE", "SUSPENDED", "ROLLED_BACK"].includes(proposal.status)) throw new AppError("PROPOSAL_LOCKED", "Compile a new proposal after activation or rollback; the approved version is immutable.", { status: 409 });
}
