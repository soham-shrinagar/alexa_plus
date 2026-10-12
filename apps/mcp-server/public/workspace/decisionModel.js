// Presentation-only helpers. The server validates and verifies every scenario.
export function scenarioFromControls({
  extraTravelMinutes = 0,
  raining = false,
  capabilities = [],
  stepId = "",
  taskMinutes = 0,
}) {
  const events = [];
  if (extraTravelMinutes)
    events.push({
      type: "TRAVEL_DELAY",
      minutes: extraTravelMinutes,
      hypothetical: true,
    });
  if (raining) events.push({ type: "RAIN", raining: true, hypothetical: true });
  for (const capability of [...new Set(capabilities.filter(Boolean))].sort())
    events.push({
      type: "CAPABILITY_UNAVAILABLE",
      capability,
      hypothetical: true,
    });
  if (stepId)
    events.push({
      type: "TASK_ALLOWANCE",
      stepId,
      minutes: taskMinutes,
      hypothetical: true,
    });
  return { events };
}
export function describeChange(change) {
  const timing =
    change.from === change.to ? "" : `${change.from} → ${change.to}`;
  const duration =
    change.durationMinutes !== undefined &&
    change.originalDurationMinutes !== change.durationMinutes
      ? `${change.originalDurationMinutes} → ${change.durationMinutes} min duration`
      : "";
  return `${change.label}: ${[timing, duration].filter(Boolean).join(" · ") || "unchanged"}${change.optional && change.to === "Skipped" ? " (optional)" : ""}`;
}
export function describeEvent(event, tasks = []) {
  const target =
    tasks.find((task) => task.id === event.stepId)?.label ?? event.stepId;
  if (event.type === "TRAVEL_DELAY") return `+${event.minutes} min travel`;
  if (event.type === "RAIN")
    return event.raining ? "Rain assumed" : "Dry conditions assumed";
  if (event.type === "CAPABILITY_UNAVAILABLE")
    return `${event.capability} unavailable`;
  if (event.type === "TASK_ALLOWANCE")
    return `+${event.minutes} min for ${target}`;
  return "Unsupported condition";
}
export function formatFacts(facts) {
  return Object.entries(facts)
    .map(([key, value]) => {
      const label = key.replace(/([A-Z])/g, " $1").toLowerCase();
      const clock =
        Number.isFinite(value) && key.endsWith("Minute")
          ? `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
          : String(value ?? "not available");
      return `${label}: ${clock}`;
    })
    .join(" · ");
}
