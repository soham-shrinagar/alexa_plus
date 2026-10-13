import { hash, projectSchema, validateScenario } from "./schema.js";
import { EventQueue } from "./eventQueue.js";

export const ENGINE_VERSION = "preflight/1";
const known = (value) => value === "on" || value === "off";

/** Pure bounded interpreter. Queue order is explicit, not a claim about HA thread scheduling. */
export function simulate(
  rawProject,
  rawScenario,
  { maxSteps = 4000, reverseTies = false } = {},
) {
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 10000)
    throw new Error("maxSteps must be 1..10000");
  const project = projectSchema.parse(rawProject);
  const scenario = validateScenario(project, rawScenario);
  const states = structuredClone({ ...project.entities, ...scenario.initial });
  const initialStates = structuredClone(states);
  const trace = [],
    findings = [],
    interactions = [],
    uncertainties = new Set(),
    queue = new EventQueue(),
    active = new Map();
  const commands = new Map();
  const expectationHits = new Set(),
    lastWrite = new Map();
  let queueLimited = false;
  let now = 0,
    sequence = 0,
    runSequence = 0,
    steps = 0;
  const record = (kind, detail = {}, parent = null) => {
    const item = { id: trace.length + 1, at: now, kind, parent, ...detail };
    trace.push(item);
    return item.id;
  };
  const enqueue = (item) => {
    if (queue.size >= maxSteps) {
      queueLimited = true;
      uncertainties.add("Queue budget exhausted; execution is incomplete");
      return;
    }
    queue.push({ ...item, sequence: sequence++ });
  };
  const matches = (condition) => {
    const actual = states[condition.entityId].state;
    if (!known(actual))
      uncertainties.add(`Unknown condition: ${condition.entityId}`);
    return actual === condition.state;
  };
  const trigger = (event, parent) => {
    const rules = reverseTies ? [...project.rules].reverse() : project.rules;
    for (const rule of rules) {
      for (const t of rule.triggers) {
        const match =
          t.kind === "state"
            ? event.kind === "state" &&
              event.entityId === t.entityId &&
              event.previous !== event.state &&
              event.state === t.to &&
              (t.from === undefined || t.from === event.previous)
            : event.kind === "event" &&
              event.eventType === t.eventType &&
              Object.entries(t.data).every(
                ([key, value]) => event.data[key] === value,
              );
        if (match) enqueue({ at: now, kind: "trigger", rule, parent });
      }
    }
  };
  const set = (entityId, value, parent, external = false) => {
    const previous = states[entityId];
    if (!external && !known(previous.state)) {
      uncertainties.add(`Cannot predict unavailable target: ${entityId}`);
      record("unknown_target", { entityId }, parent);
      return;
    }
    const next = { ...previous, ...value };
    states[entityId] = next;
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      const id = record(
        "state_changed",
        {
          entityId,
          previous: previous.state,
          state: next.state,
          ...(next.brightness !== undefined
            ? { brightness: next.brightness }
            : {}),
        },
        parent,
      );
      lastWrite.set(entityId, id);
      trigger(
        {
          kind: "state",
          entityId,
          previous: previous.state,
          state: next.state,
        },
        id,
      );
    }
  };
  const checkExpectations = (final) => {
    for (const expectation of project.expectations) {
      if (expectation.kind === "final" && !final) continue;
      if (!expectation.when.every(matches)) continue;
      expectationHits.add(expectation.id);
      const actual = states[expectation.entityId];
      if (
        !known(actual.state) ||
        (expectation.maxBrightness !== undefined &&
          actual.state === "on" &&
          actual.brightness === undefined)
      ) {
        uncertainties.add(`Unknown expectation value: ${expectation.id}`);
        continue;
      }
      if (
        actual.state !== expectation.state ||
        (expectation.maxBrightness !== undefined &&
          actual.brightness > expectation.maxBrightness)
      ) {
        if (!findings.some((f) => f.expectationId === expectation.id))
          findings.push({
            kind: "expectation_violation",
            expectationId: expectation.id,
            at: now,
            entityId: expectation.entityId,
            expected: expectation.state,
            actual: structuredClone(actual),
            cause: lastWrite.get(expectation.entityId) ?? null,
            description: expectation.description,
          });
      }
    }
  };
  const externalEvents = scenario.events
    .map((event, index) => ({ ...event, index }))
    .sort(
      (a, b) =>
        a.at - b.at || (reverseTies ? b.index - a.index : a.index - b.index),
    );
  externalEvents.forEach((event) =>
    enqueue({ at: event.at, kind: "external", event }),
  );
  if (!queue.size || queue.peek().at > 0) checkExpectations(false);
  while (queue.size && !queueLimited) {
    if (queue.peek().at > scenario.until) break;
    if (steps >= maxSteps) {
      uncertainties.add(
        "Step budget exhausted; possible feedback loop, not proof of one",
      );
      break;
    }
    const item = queue.pop();
    now = item.at;
    steps++;
    if (item.kind === "external") {
      const { event } = item;
      const parent = record("input", { event });
      if (event.kind === "state")
        set(
          event.entityId,
          {
            state: event.state,
            ...(event.brightness !== undefined
              ? { brightness: event.brightness }
              : {}),
          },
          parent,
          true,
        );
      else trigger(event, parent);
    } else if (item.kind === "trigger") {
      const { rule } = item;
      const parent = record("trigger", { ruleId: rule.id }, item.parent);
      if (!rule.conditions.every(matches))
        record("condition_blocked", { ruleId: rule.id }, parent);
      else if (active.has(rule.id) && rule.mode === "single")
        record("single_skipped", { ruleId: rule.id }, parent);
      else {
        if (active.has(rule.id))
          record(
            "cancelled",
            { ruleId: rule.id, runId: active.get(rule.id) },
            parent,
          );
        const runId = ++runSequence;
        active.set(rule.id, runId);
        const start = record("started", { ruleId: rule.id, runId }, parent);
        enqueue({
          at: now,
          kind: "step",
          rule,
          runId,
          index: 0,
          parent: start,
        });
      }
    } else if (active.get(item.rule.id) === item.runId) {
      const { rule, runId, index } = item,
        action = rule.actions[index];
      if (!action) {
        active.delete(rule.id);
        record("finished", { ruleId: rule.id, runId }, item.parent);
      } else {
        const parent = record(
          "action",
          {
            ruleId: rule.id,
            runId,
            index,
            sourceKey: `${rule.id}/actions/${index}`,
            action,
          },
          item.parent,
        );
        if (action.kind === "condition" && !matches(action.condition)) {
          active.delete(rule.id);
          record("condition_stopped", { ruleId: rule.id, runId }, parent);
        } else {
          if (action.kind === "set")
            for (const entityId of action.entityIds) {
              const previous = commands.get(entityId);
              if (
                previous &&
                previous.ruleId !== rule.id &&
                previous.state !== action.state
              )
                interactions.push({
                  kind: "opposing_commands",
                  entityId,
                  previous,
                  next: {
                    ruleId: rule.id,
                    state: action.state,
                    at: now,
                    traceId: parent,
                  },
                  verdict:
                    "Interaction only; requires an expectation to classify as unwanted.",
                });
              commands.set(entityId, {
                ruleId: rule.id,
                state: action.state,
                at: now,
                traceId: parent,
              });
              set(
                entityId,
                {
                  state: action.state,
                  ...(action.brightness !== undefined
                    ? { brightness: action.brightness }
                    : {}),
                },
                parent,
              );
            }
          enqueue({
            ...item,
            at: now + (action.kind === "delay" ? action.milliseconds : 0),
            index: index + 1,
            parent,
          });
        }
      }
    }
    // Evaluate invariants after the same-timestamp reactions settle, not between microsteps.
    if (!queueLimited && queue.peek()?.at !== now) checkExpectations(false);
  }
  const pending = [...queue.values()].filter(
    (item) => item.kind !== "step" || active.get(item.rule.id) === item.runId,
  ).length;
  if (pending) uncertainties.add("Pending work beyond horizon or budget");
  if (!queueLimited && (steps < maxSteps || !pending)) {
    now = scenario.until;
    checkExpectations(true);
  }
  for (const expectation of project.expectations)
    if (!expectationHits.has(expectation.id))
      uncertainties.add(`Expectation not exercised: ${expectation.id}`);
  const status = findings.length
    ? "VIOLATION"
    : uncertainties.size
      ? "INCONCLUSIVE"
      : project.expectations.length
        ? "NO_VIOLATION_FOUND"
        : "UNASSESSED";
  return {
    engineVersion: ENGINE_VERSION,
    projectHash: hash(project),
    scenarioHash: hash(scenario),
    scenarioId: scenario.id,
    status,
    initialStates,
    states,
    findings,
    interactions,
    trace,
    coverage: {
      until: scenario.until,
      steps,
      maxSteps,
      pending,
      ordering: reverseTies
        ? "reverse-input-and-rule-order"
        : "input-and-rule-order",
      exercisedExpectations: [...expectationHits],
      uncertainties: [...uncertainties],
      complete: !uncertainties.size,
      claim:
        "Only this finite scenario and declared model; not a guarantee about a physical home.",
    },
  };
}

export function causalTrace(result, traceId) {
  const chain = [],
    byId = new Map(result.trace.map((row) => [row.id, row]));
  let item = byId.get(traceId);
  while (item && chain.length <= result.trace.length) {
    chain.unshift(item);
    item = byId.get(item.parent);
  }
  return chain;
}
