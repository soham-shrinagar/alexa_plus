import { AppError } from "../errors.js";
import { rehearse, runtimeFingerprint } from "../domain/rehearsalEngine.js";
import { buildMicroTwin } from "../domain/microTwinBuilder.js";
import { assessEvidence } from "../domain/evidenceAssessment.js";

export class RehearsalService {
  constructor(service) {
    this.service = service;
  }
  async source(
    userId,
    proposalId,
    useRuntime = false,
    repository = this.service.repository,
  ) {
    const proposal = await repository.getProposal(userId, proposalId);
    const activation = useRuntime
      ? await repository.getActiveActivationForProposal(userId, proposalId)
      : null;
    if (useRuntime && !activation)
      throw new AppError(
        "RUNTIME_NOT_FOUND",
        "There is no active runtime to recover.",
        { status: 409 },
      );
    return {
      proposal,
      activation,
      base: activation?.runtimeState.approvedRoutine ?? proposal.routine,
      context: activation?.runtimeState.context ?? proposal.context,
    };
  }
  async compare(userId, { proposalId, scenario, useRuntime = false }) {
    const source = await this.source(userId, proposalId, useRuntime);
    const result = rehearse(source.base, source.context, scenario);
    return {
      ...result,
      proposalId,
      sourceVersion: source.proposal.version,
      sourceRuntimeHash: source.activation
        ? runtimeFingerprint(source.activation)
        : null,
      sourceMode: useRuntime ? "runtime" : "proposal",
      evidence: source.base.context.evidence ?? [],
    };
  }
  async adopt(
    userId,
    {
      proposalId,
      expectedVersion,
      scenario,
      choice,
      useRuntime = false,
      sourceRuntimeHash,
      confirmed,
    },
  ) {
    if (!confirmed)
      throw new AppError(
        "CONFIRMATION_REQUIRED",
        "Confirm the specific rehearsal alternative before saving it.",
        { status: 409 },
      );
    return this.service.repository.withUserLock(userId, async (repository) => {
      const source = await this.source(
        userId,
        proposalId,
        useRuntime,
        repository,
      );
      if (source.proposal.version !== expectedVersion)
        throw new AppError(
          "STALE_PROPOSAL",
          "The source version changed; compare again.",
          { status: 409 },
        );
      if (
        source.activation &&
        runtimeFingerprint(source.activation) !== sourceRuntimeHash
      )
        throw new AppError(
          "STALE_RUNTIME",
          "The runtime changed; compare recovery choices again.",
          { status: 409 },
        );
      if (
        !useRuntime &&
        ["ACTIVE", "SUSPENDED"].includes(source.proposal.status)
      )
        throw new AppError(
          "USE_RUNTIME_RECOVERY",
          "Compare against the current runtime when replacing an active plan.",
          { status: 409 },
        );
      const comparison = rehearse(source.base, source.context, scenario);
      const selected = comparison.options.find((item) => item.id === choice);
      if (!selected?.feasible)
        throw new AppError(
          "ALTERNATIVE_BLOCKED",
          "This alternative does not pass verification. Its policies were not relaxed.",
          { status: 409 },
        );
      const routine = structuredClone(selected.routine);
      delete routine.replacement;
      routine.goal ??= source.proposal.goal;
      routine.lineage = {
        parentProposalId: proposalId,
        parentVersion: expectedVersion,
        choice,
        scenario: comparison.scenario,
        changeSummary: selected.tradeoff,
      };
      if (source.activation)
        routine.replacement = {
          activationId: source.activation.id,
          runtimeHash: sourceRuntimeHash,
          proposalId,
        };
      const proposal = await repository.createProposal(userId, {
        scenarioId: source.proposal.scenarioId,
        goal: routine.goal,
        routine,
        context: routine.context,
        microTwin: buildMicroTwin(
          {
            household: routine.householdProfile ?? {
              people: source.proposal.microTwin.people,
              devices: source.proposal.microTwin.devices,
            },
          },
          routine,
        ),
        status: "VERIFIED",
      });
      const simulation = await repository.createSimulation(userId, {
        proposalId: proposal.id,
        proposalVersion: proposal.version,
        ...selected.verification,
      });
      await repository.addAuditEvent(userId, {
        proposalId: proposal.id,
        activationId: null,
        type: "REHEARSAL_ALTERNATIVE_ACCEPTED",
        details: routine.lineage,
      });
      return {
        proposal,
        simulation,
        evidenceAssessment:assessEvidence(routine,routine.context,Date.now(),simulation.status),
        changes: selected.changes,
        replacementPending: Boolean(source.activation),
        message: source.activation
          ? "Recovery proposal verified. Review a new approval to replace the previous runtime atomically."
          : "Alternative saved as a separate verified plan. Review it before activation.",
      };
    });
  }
}
