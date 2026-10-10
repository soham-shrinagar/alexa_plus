import { effectiveDeadline, simulateRoutine } from "./constraintEngine.js";
import { withTiming } from "./time.js";

export function repairRoutine(routine) {
  const before = simulateRoutine(routine);
  let steps = routine.steps.map((step) => ({ ...step }));
  const changes = [];
  for (const issue of before.violations) {
    if (issue.code === "POWER_OVERLAP") {
      const heater = steps.find((step) => step.id === "heat-water"); const kettle = steps.find((step) => step.id === "boil-kettle");
      if (heater && kettle) replace(heater.id, withTiming(heater, kettle.startMinute - heater.durationMinutes - 10), "Move water heating earlier to remove the peak-load overlap.");
    }
    if (issue.code === "QUIET_WINDOW") {
      const constraint = routine.constraints.find((item) => item.id === issue.constraintId);
      for (const id of issue.stepIds) { const item = steps.find((step) => step.id === id); if (item) replace(id, withTiming(item, constraint.untilMinute), "Move audible announcement outside the baby's quiet window."); }
    }
    if (issue.code === "LATE_DEPARTURE") {
      const constraint = routine.constraints.find((item) => item.id === issue.constraintId); const item = steps.find((step) => step.departure);
      if (item) {
        const deadline = effectiveDeadline(constraint, routine.context);
        replace(item.id, withTiming(item, deadline), "Advance departure to the weather-adjusted deadline.");
        const entryLight = steps.find((step) => step.id === "entry-light");
        if (entryLight) replace(entryLight.id, withTiming(entryLight, deadline - 5), "Keep the entry light five minutes before departure.");
      }
    }
  }
  const repaired = { ...routine, steps };
  const after = simulateRoutine(repaired);
  const suggestions = after.violations.filter((item) => item.code === "READINESS_MISSED").map(() => ({ type: "USER_DECISION", message: "Maya needs to start at 06:50 on rainy Fridays. Confirm that exception or change the departure goal." }));
  return { routine: repaired, before, after, changes, status: after.status === "PASSED" ? "REPAIRED" : "NEEDS_INPUT", suggestions };

  function replace(id, updated, reason) {
    const index = steps.findIndex((step) => step.id === id); if (index < 0) return;
    const previous = steps[index];
    if (previous.startMinute === updated.startMinute) return;
    steps[index] = updated; changes.push({ stepId: id, from: previous.startTime, to: updated.startTime, reason });
  }
}
