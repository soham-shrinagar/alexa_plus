export function replayStates(run, index) {
  const states = structuredClone(run.initialStates);
  for (const row of run.trace.slice(0, index + 1))
    if (row.kind === "state_changed")
      states[row.entityId] = {
        ...states[row.entityId],
        state: row.state,
        ...(row.brightness !== undefined ? { brightness: row.brightness } : {}),
      };
  return states;
}
export function eventLabel(row) {
  if (row.kind === "input")
    return row.event.kind === "state"
      ? `Input: ${row.event.entityId} → ${row.event.state}`
      : `Event: ${row.event.eventType}`;
  if (row.kind === "state_changed")
    return `${row.entityId}: ${row.previous} → ${row.state}`;
  if (row.kind === "action") {
    if (row.action.kind === "delay")
      return `Wait ${row.action.milliseconds} ms`;
    if (row.action.kind === "condition")
      return `Check ${row.action.condition.entityId} is ${row.action.condition.state}`;
    return `${row.action.entityIds.join(", ")} → ${row.action.state}${row.action.brightness === undefined ? "" : ` (${row.action.brightness}/255)`}`;
  }
  return `${{ started: "Run started", finished: "Run finished", trigger: "Trigger matched", cancelled: "Previous run cancelled", single_skipped: "Already running: trigger skipped", condition_blocked: "Entry condition did not match", condition_stopped: "Guard stopped the remaining actions", unknown_target: "Target unavailable" }[row.kind] ?? row.kind}${row.ruleId ? ` · ${row.ruleId}` : ""}`;
}
export function parentChain(run, traceId) {
  const rows = new Map(run.trace.map((r) => [r.id, r])),
    result = [];
  let row = rows.get(traceId);
  while (row && result.length <= run.trace.length) {
    result.unshift(row);
    row = rows.get(row.parent);
  }
  return result;
}
