import { AppError } from "../errors.js";
import { simulateRoutine } from "./constraintEngine.js";
import { withTiming } from "./time.js";

export function adaptRoutine(routine, event) {
  const context = structuredClone(routine.context);
  let steps = routine.steps.map((step) => ({ ...step }));
  const changes = [];
  if (event.type === "DEVICE_UNAVAILABLE") {
    context.unavailableCapabilities = [...new Set([...(context.unavailableCapabilities ?? []), event.capability])];
    steps = steps.filter((step) => {
      if (step.capability !== event.capability) return true;
      if (!step.optional) return true;
      changes.push({ stepId: step.id, action: "SKIPPED", reason: `${event.capability} became unavailable; optional step removed.` }); return false;
    });
  } else if (event.type === "TRAVEL_DELAY") {
    const minutes = Number(event.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw new AppError("INVALID_EVENT", "Travel delay must be between 1 and 60 minutes.", { status: 400 });
    context.travelDelayMinutes = minutes;
    const departure = steps.find((step) => step.departure);
    if (departure) {
      const shifted = withTiming(departure, departure.startMinute - minutes);
      steps = steps.map((step) => step.id === departure.id ? shifted : step);
      changes.push({ stepId: departure.id, from: departure.startTime, to: shifted.startTime, reason: "Advance departure for the new travel delay." });
      const entryLight = steps.find((step) => step.id === "entry-light");
      if (entryLight) { const lightShifted = withTiming(entryLight, entryLight.startMinute - minutes); steps = steps.map((step) => step.id === entryLight.id ? lightShifted : step); changes.push({ stepId: entryLight.id, from: entryLight.startTime, to: lightShifted.startTime, reason: "Preserve the five-minute pre-departure light cue." }); }
    }
  } else if (event.type === "WEATHER_CHANGED") {
    context.weather = { ...context.weather, raining: Boolean(event.raining) };
    changes.push({ action: "CONTEXT_UPDATED", reason: `Rain set to ${Boolean(event.raining)}.` });
  } else throw new AppError("UNSUPPORTED_EVENT", "Supported events: DEVICE_UNAVAILABLE, TRAVEL_DELAY, WEATHER_CHANGED.", { status: 400 });
  const adapted = { ...routine, steps, context };
  return { routine: adapted, event, changes, simulation: simulateRoutine(adapted, context) };
}
