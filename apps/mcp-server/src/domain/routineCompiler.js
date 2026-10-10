import { toClock, withTiming } from "./time.js";

export function compileRoutine(parsedGoal, scenario) {
  const { departureMinute, quietUntilMinute, rainAdvanceMinutes, maxConcurrentPowerWatts } = parsedGoal;
  const steps = [
    step("heat-water", "Heat shower water", "water-heater", "heat_water", 390, 40, { powerWatts: 2000 }),
    step("morning-announcement", "Announce the morning routine", "hall-speaker", "announce", 415, 2, { powerWatts: 8, audible: true }),
    step("maya-ready", "Maya gets ready", "maya", "prepare_person", 420, 35, { requiredForDeparture: true }),
    step("boil-kettle", "Boil water", "kettle", "boil_water", 425, 7, { powerWatts: 1500 }),
    step("make-coffee", "Make coffee", "coffee-machine", "make_coffee", 432, 6, { powerWatts: 900, optional: true }),
    step("entry-light", "Turn on entry light", "entry-light", "set_light", departureMinute - 5, 5, { powerWatts: 10 }),
    step("depart", "Leave for school", "parent", "depart", departureMinute, 1, { departure: true })
  ];
  const constraints = [
    { id: "departure-deadline", type: "DEADLINE", label: `Leave by ${toClock(departureMinute)}; ${rainAdvanceMinutes} minutes earlier in rain`, atMinute: departureMinute, conditionalOffset: { path: "weather.raining", equals: true, minutes: -rainAdvanceMinutes }, severity: "critical" },
    { id: "baby-quiet", type: "QUIET_WINDOW", label: `No audible action before ${toClock(quietUntilMinute)}`, targetId: "baby", untilMinute: quietUntilMinute, severity: "critical" },
    { id: "power-budget", type: "MAX_CONCURRENT_POWER", label: `Stay below ${maxConcurrentPowerWatts}W concurrent load`, maxWatts: maxConcurrentPowerWatts, severity: "critical" },
    { id: "maya-earliest", type: "EARLIEST_START", label: "Maya normally starts at 07:00", targetId: "maya", atMinute: 420, severity: "critical" },
    { id: "device-availability", type: "DEVICE_AVAILABLE", label: "Only invoke available capabilities", severity: "critical" }
  ];
  return { title: "Adaptive school-morning routine", goal: parsedGoal.originalText, steps, constraints, context: structuredClone(scenario.environment), assumptions: parsedGoal.assumptions, compiler: "deterministic-temporal-compiler-v1" };
}

function step(id, label, targetId, capability, startMinute, durationMinutes, properties = {}) {
  return withTiming({ id, label, targetId, capability, durationMinutes, ...properties }, startMinute);
}
