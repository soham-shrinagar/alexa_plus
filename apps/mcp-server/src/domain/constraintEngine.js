import { overlaps, toClock } from "./time.js";

export function simulateRoutine(routine, context = routine.context) {
  const trace = routine.steps.slice().sort((a, b) => a.startMinute - b.startMinute).map((step) => ({ at: step.startTime, stepId: step.id, action: step.label, targetId: step.targetId, outcome: unavailable(step, context) ? "BLOCKED" : "WOULD_RUN" }));
  const violations = routine.constraints.flatMap((constraint) => evaluators[constraint.type]?.(constraint, routine.steps, context) ?? []);
  return {
    status: violations.some((item) => item.severity === "critical") ? "FAILED" : "PASSED",
    violations,
    trace,
    summary: { stepCount: routine.steps.length, checkedConstraints: routine.constraints.length, criticalViolations: violations.filter((item) => item.severity === "critical").length, context }
  };
}

const evaluators = {
  MAX_CONCURRENT_POWER(constraint, steps) {
    const powered = steps.filter((step) => step.powerWatts);
    const violations = [];
    for (let index = 0; index < powered.length; index += 1) for (let other = index + 1; other < powered.length; other += 1) {
      const left = powered[index]; const right = powered[other]; const total = left.powerWatts + right.powerWatts;
      if (overlaps(left, right) && total > constraint.maxWatts) violations.push(violation(constraint, "POWER_OVERLAP", `${left.label} and ${right.label} overlap at ${total}W, above ${constraint.maxWatts}W.`, [left.id, right.id], { totalWatts: total }));
    }
    return violations;
  },
  QUIET_WINDOW(constraint, steps) {
    return steps.filter((step) => step.audible && step.startMinute < constraint.untilMinute).map((step) => violation(constraint, "QUIET_WINDOW", `${step.label} is scheduled at ${step.startTime}, before quiet hours end at ${toClock(constraint.untilMinute)}.`, [step.id]));
  },
  DEADLINE(constraint, steps, context) {
    const effective = effectiveDeadline(constraint, context);
    const departure = steps.find((step) => step.departure);
    const findings = [];
    if (departure && departure.startMinute > effective) findings.push(violation(constraint, "LATE_DEPARTURE", `Departure at ${departure.startTime} misses the effective ${toClock(effective)} deadline.`, [departure.id], { effectiveDeadlineMinute: effective }));
    const actualDeparture = Math.min(departure?.startMinute ?? effective, effective);
    for (const step of steps.filter((item) => item.requiredForDeparture && item.endMinute > actualDeparture)) findings.push(violation(constraint, "READINESS_MISSED", `${step.label} ends at ${step.endTime}, after the required ${toClock(actualDeparture)} departure.`, [step.id, departure?.id].filter(Boolean), { effectiveDeadlineMinute: actualDeparture }));
    return findings;
  },
  EARLIEST_START(constraint, steps) {
    return steps.filter((step) => step.targetId === constraint.targetId && step.startMinute < constraint.atMinute).map((step) => violation(constraint, "EARLY_START", `${step.label} starts at ${step.startTime}, before allowed time ${toClock(constraint.atMinute)}.`, [step.id]));
  },
  DEVICE_AVAILABLE(constraint, steps, context) {
    return steps.filter((step) => unavailable(step, context) && !step.optional).map((step) => violation(constraint, "CAPABILITY_UNAVAILABLE", `${step.capability} is unavailable for ${step.label}.`, [step.id]));
  }
};

export function effectiveDeadline(constraint, context) {
  const conditional = constraint.conditionalOffset;
  return constraint.atMinute + (conditional && readPath(context, conditional.path) === conditional.equals ? conditional.minutes : 0) - Number(context.travelDelayMinutes ?? 0);
}

function unavailable(step, context) { return (context.unavailableCapabilities ?? []).includes(step.capability); }
function readPath(value, path) { return path.split(".").reduce((current, key) => current?.[key], value); }
function violation(constraint, code, message, stepIds, details = {}) { return { id: `${constraint.id}:${code}:${stepIds.join("+")}`, constraintId: constraint.id, code, message, stepIds, severity: constraint.severity, details }; }
