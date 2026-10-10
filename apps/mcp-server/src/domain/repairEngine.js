import { effectiveDeadline, simulateRoutine } from "./constraintEngine.js";
import { alignDepartureCues } from "./routineCompiler.js";
import { toClock, withTiming } from "./time.js";

export function repairRoutine(routine) {
  const before = simulateRoutine(routine);
  let steps = routine.steps.map((step) => ({ ...step }));
  const changes = [];
  for (const issue of before.violations) {
    if (issue.code === "QUIET_WINDOW") {
      const constraint = routine.constraints.find((item) => item.id === issue.constraintId);
      for (const id of issue.stepIds) { const item = steps.find((step) => step.id === id); if (item) replace(id, withTiming(item, constraint.untilMinute), "Move audible action outside the quiet window."); }
    }
    if (issue.code === "LATE_DEPARTURE") {
      const constraint = routine.constraints.find((item) => item.id === issue.constraintId);
      const item = steps.find((step) => step.departure);
      if (item) replace(item.id, withTiming(item, effectiveDeadline(constraint, routine.context)), "Advance departure to the environment-adjusted deadline.");
    }
  }
  // Move the largest flexible device load before the others. Never move people
  // or relax their earliest-start constraints to make a power check pass.
  for (let attempt = 0; attempt < steps.length; attempt += 1) {
    const issue = simulateRoutine({ ...routine, steps }).violations.find((item) => item.code === "POWER_OVERLAP");
    if (!issue) break;
    const conflictSteps = steps.filter((step) => issue.stepIds.includes(step.id));
    const flexible = conflictSteps.filter((step) => !step.requiredForDeparture && !step.audible && !step.departure).sort((a, b) => b.powerWatts - a.powerWatts)[0];
    if (!flexible) break;
    const others = conflictSteps.filter((step) => step.id !== flexible.id);
    if (!others.length) break;
    const start = Math.min(...others.map((step) => step.startMinute)) - flexible.durationMinutes - 10;
    if (start < 0) break;
    replace(flexible.id, withTiming(flexible, start), "Move the flexible device load earlier to remove the peak-load overlap.");
  }
  const aligned = alignDepartureCues(steps);
  for (const step of aligned) if (step.startMinute !== steps.find((item) => item.id === step.id).startMinute) replace(step.id, step, "Keep the pre-departure cue aligned with departure.");
  const repaired = { ...routine, steps };
  const after = simulateRoutine(repaired);
  const suggestions = after.violations.filter((item) => item.code === "READINESS_MISSED").map((issue) => {
    const preparation = steps.find((step) => step.id === issue.stepIds[0]);
    const suggestedStartMinute = issue.details.effectiveDeadlineMinute - preparation.durationMinutes - 5;
    return { type: "USER_DECISION", targetId: preparation.targetId, suggestedStartTime: toClock(suggestedStartMinute), message: `${preparation.label} needs to start at ${toClock(suggestedStartMinute)} for a five-minute departure buffer. Confirm a start-time exception or change the goal.` };
  });
  return { routine: repaired, before, after, changes, status: after.status === "PASSED" ? "REPAIRED" : "NEEDS_INPUT", suggestions };

  function replace(id, updated, reason) {
    const index = steps.findIndex((step) => step.id === id); if (index < 0) return;
    const previous = steps[index]; if (previous.startMinute === updated.startMinute) return;
    steps[index] = updated; changes.push({ stepId: id, from: previous.startTime, to: updated.startTime, reason });
  }
}
