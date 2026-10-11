import { AppError } from "../errors.js";
import { effectiveDeadline, simulateRoutine } from "./constraintEngine.js";
import { alignDepartureCues } from "./routineCompiler.js";
import { withTiming } from "./time.js";

export function adaptRoutine(routine, event, approvedRoutine = routine) {
  const context = structuredClone(routine.context);
  let steps = routine.steps.map((step) => ({ ...step }));
  const changes = [];
  if (event.type === "DEVICE_UNAVAILABLE") {
    context.unavailableCapabilities = [...new Set([...(context.unavailableCapabilities ?? []), event.capability])];
    steps = steps.filter((step) => {
      if (step.capability !== event.capability || !step.optional) return true;
      changes.push({ stepId: step.id, action: "SKIPPED", reason: `${event.capability} became unavailable; optional step removed.` }); return false;
    });
  } else if (event.type === "DEVICE_RECOVERED") {
    context.unavailableCapabilities = (context.unavailableCapabilities ?? []).filter((item) => item !== event.capability);
    for (const original of approvedRoutine.steps.filter((step) => step.capability === event.capability)) {
      if (!steps.some((step) => step.id === original.id)) { steps.push(structuredClone(original)); changes.push({ stepId: original.id, action: "RESTORED", reason: "Restore the optional action from the approved version, then reverify." }); }
    }
    changes.push({ action: "CAPABILITY_RECOVERED", reason: `${event.capability} is available again.` });
  } else if (event.type === "TRAVEL_DELAY") {
    if (!Number.isInteger(event.minutes) || event.minutes < 0 || event.minutes > 60) throw new AppError("INVALID_EVENT", "Travel delay must be between 0 and 60 minutes.", { status: 400 });
    // The event reports the current total delay, so repeated updates do not accumulate.
    context.travelDelayMinutes = event.minutes;
  } else if (event.type === "WEATHER_CHANGED") {
    context.weather = { ...context.weather, raining: event.raining };
    changes.push({ action: "CONTEXT_UPDATED", reason: `Rain set to ${event.raining}.` });
  } else throw new AppError("UNSUPPORTED_EVENT", "Supported events: DEVICE_UNAVAILABLE, DEVICE_RECOVERED, TRAVEL_DELAY, WEATHER_CHANGED.", { status: 400 });

  const deadline = routine.constraints.find((constraint) => constraint.type === "DEADLINE");
  if (deadline && ["TRAVEL_DELAY", "WEATHER_CHANGED"].includes(event.type)) {
    steps = steps.map((step) => step.departure ? withTiming(step, effectiveDeadline(deadline, context)) : step);
    steps = alignDepartureCues(steps);
    for (const step of steps) {
      const previous = routine.steps.find((item) => item.id === step.id);
      if (previous.startMinute !== step.startMinute) changes.push({ stepId: step.id, from: previous.startTime, to: step.startTime, reason: "Align timing with the current weather and total travel delay." });
    }
  }
  const adapted = { ...routine, steps, context };
  return { routine: adapted, event, changes, simulation: simulateRoutine(adapted, context) };
}
