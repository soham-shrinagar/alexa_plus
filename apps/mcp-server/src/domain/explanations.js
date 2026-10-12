// A projection of verifier facts, never a second verifier or an LLM judgment.
// Resolution instructions are not marked feasible until an actual option is
// built and verified by the rehearsal engine.
export function explainVerification(
  routine,
  verification,
  context = routine.context,
) {
  const conflicts = verification.violations.map((issue) => {
    const constraint = routine.constraints.find(
      (rule) => rule.id === issue.constraintId,
    );
    const tasks = issue.stepIds
      .map((id) => routine.steps.find((step) => step.id === id))
      .filter(Boolean);
    const facts = conflictFacts(issue, constraint, tasks, context);
    return {
      violationId: issue.id,
      code: issue.code,
      constraintId: issue.constraintId,
      affectedTaskIds: issue.stepIds,
      ...facts,
      explanation: issue.message,
      resolutionKinds: resolutionKinds(issue.code, Boolean(routine.journey)),
    };
  });
  return {
    status: verification.status,
    summary: conflicts.length
      ? `${conflicts.length} declared constraint conflict${conflicts.length === 1 ? "" : "s"}. Required tasks and trusted policies were not relaxed.`
      : "Every implemented constraint passes for this declared context; this is not an outcome guarantee.",
    conflicts,
    languageSource: "deterministic-verifier-facts",
  };
}

function conflictFacts(issue, rule, tasks, context) {
  const task = tasks[0];
  switch (issue.code) {
    case "LATE_DEPARTURE":
      return {
        expected: {
          latestDepartureMinute: issue.details.effectiveDeadlineMinute,
        },
        observed: { departureMinute: task?.startMinute },
        conflict: {
          kind: "timing",
          minutes: Math.max(
            0,
            (task?.startMinute ?? 0) - issue.details.effectiveDeadlineMinute,
          ),
        },
      };
    case "READINESS_MISSED":
      return {
        expected: { finishByMinute: issue.details.effectiveDeadlineMinute },
        observed: {
          finishMinute: task?.endMinute,
          durationMinutes: task?.durationMinutes,
        },
        conflict: {
          kind: "timing",
          minutes: Math.max(
            0,
            (task?.endMinute ?? 0) - issue.details.effectiveDeadlineMinute,
          ),
        },
      };
    case "EARLY_START": {
      const minute = rule?.exceptions?.[context.weekday] ?? rule?.atMinute;
      return {
        expected: { startNotBeforeMinute: minute },
        observed: { startMinute: task?.startMinute },
        conflict: {
          kind: "policy",
          minutes: Math.max(0, (minute ?? 0) - (task?.startMinute ?? 0)),
        },
      };
    }
    case "QUIET_WINDOW":
      return {
        expected: { audibleNotBeforeMinute: rule?.untilMinute },
        observed: { startMinute: task?.startMinute, audible: task?.audible },
        conflict: { kind: "quiet-hours" },
      };
    case "POWER_OVERLAP":
      return {
        expected: { maximumWatts: rule?.maxWatts },
        observed: {
          simultaneousWatts: issue.details.totalWatts,
          atMinute: issue.details.atMinute,
        },
        conflict: {
          kind: "power",
          wattsAboveLimit: issue.details.totalWatts - (rule?.maxWatts ?? 0),
        },
      };
    case "RESOURCE_OVERLAP":
      return {
        expected: { exclusiveResourceId: task?.targetId },
        observed: {
          startMinute: Math.max(...tasks.map((step) => step.startMinute)),
          endMinute: Math.min(...tasks.map((step) => step.endMinute)),
        },
        conflict: { kind: "resource", resourceId: task?.targetId },
      };
    case "DEPENDENCY_ORDER":
      return {
        expected: {
          predecessorId: rule?.predecessorId,
          finishBeforeStepId: rule?.stepId,
        },
        observed: {
          predecessorEndMinute: tasks[0]?.endMinute,
          successorStartMinute: tasks[1]?.startMinute,
        },
        conflict: { kind: "dependency" },
      };
    case "TASK_LATE":
      return {
        expected: { finishByMinute: rule?.atMinute },
        observed: { finishMinute: task?.endMinute },
        conflict: { kind: "task-deadline" },
      };
    case "CAPABILITY_UNAVAILABLE":
      return {
        expected: { capability: task?.capability, available: true },
        observed: {
          capability: task?.capability,
          available: false,
          targetId: task?.targetId,
        },
        conflict: { kind: "capability" },
      };
    default:
      return {
        expected: {
          constraintType: rule?.type ?? "valid-timing",
          supported: true,
        },
        observed: { verifierCode: issue.code },
        conflict: { kind: "unsupported-or-missing-input" },
        limitation:
          "This condition has no automatically verified resolution. Correct the declared inputs or request a supported plan.",
      };
  }
}
function resolutionKinds(code, journey) {
  if (["LATE_DEPARTURE", "READINESS_MISSED"].includes(code))
    return journey
      ? ["EARLIER_PREPARATION", "LATER_ARRIVAL"]
      : ["REPAIR_TIMING", "EXPLICIT_REQUEST_REVISION"];
  if (
    [
      "RESOURCE_OVERLAP",
      "DEPENDENCY_ORDER",
      "POWER_OVERLAP",
      "QUIET_WINDOW",
      "TASK_LATE",
      "EARLY_START",
    ].includes(code)
  )
    return ["REPAIR_TIMING", "EXPLICIT_REQUEST_REVISION"];
  if (code === "CAPABILITY_UNAVAILABLE")
    return ["RESTORE_DECLARED_CAPABILITY", "EXPLICIT_REQUEST_REVISION"];
  return ["CLARIFY_DECLARED_INPUT"];
}
