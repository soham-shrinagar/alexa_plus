import { toClock } from "./time.js";
import { explainVerification } from "./explanations.js";

export function simulateRoutine(routine, context = routine.context) {
  const trace = routine.steps
    .slice()
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((step) => ({
      at: step.startTime,
      stepId: step.id,
      action: step.label,
      targetId: step.targetId,
      outcome: unavailable(step, context) ? "BLOCKED" : "WOULD_RUN",
    }));
  const violations = routine.constraints.flatMap((constraint) =>
    evaluators[constraint.type]
      ? evaluators[constraint.type](constraint, routine.steps, context)
      : [
          violation(
            { ...constraint, severity: "critical" },
            "UNSUPPORTED_CONSTRAINT",
            `Cannot verify constraint type ${constraint.type}.`,
            [],
          ),
        ],
  );
  for (const step of routine.steps) {
    if (
      ![step.startMinute, step.endMinute, step.durationMinutes].every(
        Number.isInteger,
      ) ||
      step.startMinute < 0 ||
      step.endMinute > 1440 ||
      step.durationMinutes <= 0 ||
      step.endMinute !== step.startMinute + step.durationMinutes
    ) {
      violations.push(
        violation(
          { id: "valid-timing", severity: "critical" },
          "INVALID_TIMING",
          `${step.label} has invalid or cross-day timing.`,
          [step.id],
        ),
      );
    }
  }
  const result = {
    status: violations.some((item) => item.severity === "critical")
      ? "FAILED"
      : "PASSED",
    violations,
    trace,
    summary: {
      stepCount: routine.steps.length,
      checkedConstraints: routine.constraints.length,
      criticalViolations: violations.filter(
        (item) => item.severity === "critical",
      ).length,
      context,
    },
  };
  result.summary.explanation = explainVerification(routine, result, context);
  return result;
}

const evaluators = {
  RESOURCE_EXCLUSIVE(constraint, steps) {
    return steps.flatMap((left, index) =>
      steps
        .slice(index + 1)
        .filter(
          (right) =>
            left.targetId === right.targetId &&
            left.startMinute < right.endMinute &&
            right.startMinute < left.endMinute,
        )
        .map((right) =>
          violation(
            constraint,
            "RESOURCE_OVERLAP",
            `${left.label} and ${right.label} need ${left.targetId} at the same time.`,
            [left.id, right.id],
          ),
        ),
    );
  },
  DEPENDENCY(constraint, steps) {
    const before = steps.find((step) => step.id === constraint.predecessorId);
    const after = steps.find((step) => step.id === constraint.stepId);
    if (!before || !after)
      return [
        violation(
          constraint,
          "MISSING_DEPENDENCY",
          "A required dependency step is missing.",
          [constraint.predecessorId, constraint.stepId],
        ),
      ];
    return before.endMinute > after.startMinute
      ? [
          violation(
            constraint,
            "DEPENDENCY_ORDER",
            `${before.label} must finish before ${after.label} starts.`,
            [before.id, after.id],
          ),
        ]
      : [];
  },
  TASK_DEADLINE(constraint, steps) {
    const step = steps.find((item) => item.id === constraint.stepId);
    if (!step)
      return [
        violation(
          constraint,
          "MISSING_TASK",
          "A deadline-bound task is missing.",
          [constraint.stepId],
        ),
      ];
    return step.endMinute > constraint.atMinute
      ? [
          violation(
            constraint,
            "TASK_LATE",
            `${step.label} finishes after ${toClock(constraint.atMinute)}.`,
            [step.id],
            { atMinute: constraint.atMinute },
          ),
        ]
      : [];
  },
  MAX_CONCURRENT_POWER(constraint, steps) {
    const powered = steps.filter((step) => step.powerWatts);
    const boundaries = [
      ...new Set(powered.flatMap((step) => [step.startMinute, step.endMinute])),
    ].sort((a, b) => a - b);
    const violations = [];
    for (const minute of boundaries) {
      const active = powered.filter(
        (step) => step.startMinute <= minute && step.endMinute > minute,
      );
      const total = active.reduce((sum, step) => sum + step.powerWatts, 0);
      if (total > constraint.maxWatts)
        violations.push(
          violation(
            constraint,
            "POWER_OVERLAP",
            `${active.map((step) => step.label).join(" + ")} overlap at ${total}W, above ${constraint.maxWatts}W.`,
            active.map((step) => step.id),
            { totalWatts: total, atMinute: minute },
          ),
        );
    }
    return violations;
  },
  QUIET_WINDOW(constraint, steps) {
    return steps
      .filter(
        (step) => step.audible && step.startMinute < constraint.untilMinute,
      )
      .map((step) =>
        violation(
          constraint,
          "QUIET_WINDOW",
          `${step.label} is scheduled at ${step.startTime}, before quiet hours end at ${toClock(constraint.untilMinute)}.`,
          [step.id],
        ),
      );
  },
  DEADLINE(constraint, steps, context) {
    const effective = effectiveDeadline(constraint, context);
    const departure = steps.find((step) => step.departure);
    const findings = [];
    if (!departure)
      findings.push(
        violation(
          constraint,
          "MISSING_DEPARTURE",
          "The routine has a departure deadline but no departure step.",
          [],
        ),
      );
    if (departure && departure.startMinute > effective)
      findings.push(
        violation(
          constraint,
          "LATE_DEPARTURE",
          `Departure at ${departure.startTime} misses the effective ${toClock(effective)} deadline.`,
          [departure.id],
          { effectiveDeadlineMinute: effective },
        ),
      );
    const actualDeparture = Math.min(
      departure?.startMinute ?? effective,
      effective,
    );
    for (const step of steps.filter(
      (item) =>
        item.requiredForDeparture &&
        !item.departure &&
        item.endMinute > actualDeparture,
    ))
      findings.push(
        violation(
          constraint,
          "READINESS_MISSED",
          `${step.label} ends at ${step.endTime}, after the required ${toClock(actualDeparture)} departure.`,
          [step.id, departure?.id].filter(Boolean),
          { effectiveDeadlineMinute: actualDeparture },
        ),
      );
    return findings;
  },
  EARLIEST_START(constraint, steps, context) {
    const earliest =
      constraint.exceptions?.[context.weekday] ?? constraint.atMinute;
    return steps
      .filter(
        (step) =>
          step.targetId === constraint.targetId && step.startMinute < earliest,
      )
      .map((step) =>
        violation(
          constraint,
          "EARLY_START",
          `${step.label} starts at ${step.startTime}, before allowed time ${toClock(earliest)}.`,
          [step.id],
        ),
      );
  },
  DEVICE_AVAILABLE(constraint, steps, context) {
    return steps
      .filter((step) => unavailable(step, context) && !step.optional)
      .map((step) =>
        violation(
          constraint,
          "CAPABILITY_UNAVAILABLE",
          `${step.capability} is unavailable for ${step.label}.`,
          [step.id],
        ),
      );
  },
};

export function effectiveDeadline(constraint, context) {
  const conditional = constraint.conditionalOffset;
  return (
    constraint.atMinute +
    (conditional && readPath(context, conditional.path) === conditional.equals
      ? conditional.minutes
      : 0) -
    Number(context.travelDelayMinutes ?? 0)
  );
}

function unavailable(step, context) {
  return (context.unavailableCapabilities ?? []).includes(step.capability);
}
function readPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}
function violation(constraint, code, message, stepIds, details = {}) {
  return {
    id: `${constraint.id}:${code}:${stepIds.join("+")}`,
    constraintId: constraint.id,
    code,
    message,
    stepIds,
    severity: constraint.severity,
    details,
  };
}
