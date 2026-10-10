export function buildMicroTwin(scenario, routine) {
  const targets = new Set(routine.steps.map((step) => step.targetId));
  for (const constraint of routine.constraints) if (constraint.targetId) targets.add(constraint.targetId);
  const people = scenario.household.people.filter((person) => targets.has(person.id));
  const devices = scenario.household.devices.filter((device) => targets.has(device.id));
  return {
    kind: "just-in-time-micro-twin",
    generatedFor: routine.title,
    people,
    devices,
    constraints: routine.constraints,
    excludedEntityCount: scenario.household.people.length + scenario.household.devices.length - people.length - devices.length,
    retention: "proposal-scoped",
    explanation: "Contains only entities referenced by this routine; it is not a permanent or exhaustive house twin."
  };
}
