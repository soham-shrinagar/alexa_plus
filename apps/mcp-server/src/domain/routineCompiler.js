import { toClock, withTiming } from "./time.js";

export function compileRoutine(parsedGoal, scenario) {
  const { departureMinute, quietUntilMinute, rainAdvanceMinutes, maxConcurrentPowerWatts } = parsedGoal;
  const template = scenario.routineTemplate;
  const steps = template.steps.map((action) => withTiming(action, action.departure ? departureMinute : action.relativeToDepartureMinutes !== undefined ? departureMinute + action.relativeToDepartureMinutes : action.startMinute));
  const preparation = steps.find((action) => action.targetId === template.preparationTargetId);
  const constraints = [
    { id: "departure-deadline", type: "DEADLINE", label: `Leave by ${toClock(departureMinute)}; ${rainAdvanceMinutes} minutes earlier in rain`, atMinute: departureMinute, conditionalOffset: { path: "weather.raining", equals: true, minutes: -rainAdvanceMinutes }, severity: "critical" },
    { id: "baby-quiet", type: "QUIET_WINDOW", label: `No audible action before ${toClock(quietUntilMinute)}`, targetId: template.quietTargetId, untilMinute: quietUntilMinute, severity: "critical" },
    { id: "power-budget", type: "MAX_CONCURRENT_POWER", label: `Stay below ${maxConcurrentPowerWatts}W concurrent load`, maxWatts: maxConcurrentPowerWatts, severity: "critical" },
    { id: `${template.preparationTargetId}-earliest`, type: "EARLIEST_START", label: `Preparation normally starts at ${preparation.startTime}`, targetId: template.preparationTargetId, atMinute: preparation.startMinute, severity: "critical" },
    { id: "device-availability", type: "DEVICE_AVAILABLE", label: "Only invoke available capabilities", severity: "critical" }
  ];
  return { title: template.title, goal: parsedGoal.originalText, steps, constraints, context: structuredClone(scenario.environment), assumptions: parsedGoal.assumptions, compiler: "deterministic-temporal-compiler-v1" };
}

export function alignDepartureCues(steps) {
  const departure = steps.find((step) => step.departure);
  if (!departure) return steps;
  return steps.map((step) => step.relativeToDepartureMinutes !== undefined ? withTiming(step, departure.startMinute + step.relativeToDepartureMinutes) : step);
}
