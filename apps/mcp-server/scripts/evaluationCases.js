// Synthetic acceptance cases authored after phases 1–5. Labels are declared here,
// never calculated from the interpreter. This is not a blinded third-party dataset.
import { CONTRACT_VERSION } from "../src/automation/schema.js";
import { stringify } from "yaml";
import { toHaRules } from "../src/automation/importYaml.js";

const stateEvent = (entityId, state, at) => ({
  kind: "state",
  entityId,
  state,
  at,
});
const set = (entityId, state) => ({
  kind: "set",
  entityIds: [entityId],
  state,
});
const rule = (id, trigger, actions) => ({
  id,
  name: id,
  mode: "restart",
  triggers: [trigger],
  conditions: [],
  actions,
});
const trigger = (entityId, to = "on") => ({ kind: "state", entityId, to });
const intent = (entityId, state, when = []) => ({
  id: "intent",
  description: "Declared desired behavior for this experiment",
  confirmed: true,
  kind: "invariant",
  when,
  entityId,
  state,
});
const scenario = (events, until = 1000) => ({
  id: "experiment",
  events,
  until,
});

export function evaluationCases() {
  const cases = [];
  const add = (
    id,
    category,
    project,
    input,
    expectedStatus,
    expectedStates,
    repairEligible = false,
    suite,
  ) => {
    cases.push({
      id,
      category,
      source: stringify(toHaRules(project), { version: "1.1" }),
      entities: project.entities,
      expectations: project.expectations,
      scenario: input,
      label: { status: expectedStatus, states: expectedStates, repairEligible },
      suite: suite ?? [{ scenario: input, expected: expectedStates }],
    });
  };
  const p = {
    version: CONTRACT_VERSION,
    entities: {
      "input_boolean.occupancy": { state: "off" },
      "switch.desk": { state: "off" },
      "input_boolean.keep": { state: "off" },
    },
    rules: [
      rule("desk_timer", trigger("input_boolean.occupancy"), [
        set("switch.desk", "on"),
        { kind: "delay", milliseconds: 420 },
        set("switch.desk", "off"),
      ]),
      rule("keep_on", trigger("input_boolean.keep"), [
        set("switch.desk", "on"),
      ]),
    ],
    expectations: [
      intent("switch.desk", "on", [
        { entityId: "input_boolean.keep", state: "on" },
      ]),
    ],
  };
  const occupied = stateEvent("input_boolean.occupancy", "on", 70);
  const held = stateEvent("input_boolean.keep", "on", 300);
  const failure = scenario([occupied, held]);
  const normal = { ...scenario([occupied]), id: "ordinary" };
  const suite = [
    { scenario: failure, expected: { "switch.desk": "on" } },
    { scenario: normal, expected: { "switch.desk": "off" } },
  ];
  add(
    "delayed_desk_override",
    "conflict",
    structuredClone(p),
    failure,
    "VIOLATION",
    { "switch.desk": "off" },
    true,
    suite,
  );
  const guarded = structuredClone(p);
  guarded.rules[0].actions.splice(2, 0, {
    kind: "condition",
    condition: { entityId: "input_boolean.keep", state: "off" },
  });
  add("guarded_desk", "clean", guarded, failure, "NO_VIOLATION_FOUND", {
    "switch.desk": "on",
  });
  const harmless = structuredClone(p);
  harmless.expectations = [{ ...intent("switch.desk", "off"), kind: "final" }];
  add(
    "ordinary_opposing_commands",
    "clean",
    harmless,
    normal,
    "NO_VIOLATION_FOUND",
    { "switch.desk": "off" },
  );
  const unknown = structuredClone(guarded);
  unknown.entities["input_boolean.keep"].state = "unknown";
  add("unknown_guard", "incomplete", unknown, normal, "INCONCLUSIVE", {
    "switch.desk": "on",
  });
  add(
    "unfinished_delay",
    "incomplete",
    structuredClone(p),
    scenario([occupied, held], 350),
    "INCONCLUSIVE",
    { "switch.desk": "on" },
  );
  const ambiguous = structuredClone(p);
  ambiguous.expectations = [];
  add("no_confirmed_intent", "ambiguous", ambiguous, normal, "UNASSESSED", {
    "switch.desk": "off",
  });
  const filtered = structuredClone(harmless);
  filtered.rules = [
    rule(
      "button",
      { kind: "event", eventType: "desk_button", data: { button: "right" } },
      [set("switch.desk", "on")],
    ),
  ];
  add(
    "event_filter_miss",
    "clean",
    filtered,
    scenario([
      {
        kind: "event",
        eventType: "desk_button",
        data: { button: "left" },
        at: 20,
      },
    ]),
    "NO_VIOLATION_FOUND",
    { "switch.desk": "off" },
  );
  const chain = structuredClone(harmless);
  chain.rules = [
    rule("arrival", trigger("input_boolean.occupancy"), [
      set("input_boolean.keep", "on"),
    ]),
    rule("desk_on", trigger("input_boolean.keep"), [set("switch.desk", "on")]),
  ];
  chain.expectations[0].state = "on";
  add("two_rule_chain", "clean", chain, normal, "NO_VIOLATION_FOUND", {
    "switch.desk": "on",
  });
  const unconditional = structuredClone(harmless);
  unconditional.expectations[0].state = "on";
  add(
    "unsupported_repair_intent",
    "conflict",
    unconditional,
    normal,
    "VIOLATION",
    { "switch.desk": "off" },
  );
  const brightness = {
    version: CONTRACT_VERSION,
    entities: { "light.study": { state: "off", brightness: 0 } },
    rules: [
      rule("study_bright", { kind: "event", eventType: "study", data: {} }, [
        { ...set("light.study", "on"), brightness: 220 },
      ]),
    ],
    expectations: [
      { ...intent("light.study", "on"), kind: "final", maxBrightness: 80 },
    ],
  };
  add(
    "brightness_limit",
    "conflict",
    brightness,
    scenario([{ kind: "event", eventType: "study", data: {}, at: 0 }]),
    "VIOLATION",
    { "light.study": "on" },
  );
  const loop = structuredClone(ambiguous);
  loop.rules = [
    rule("toggle_off", trigger("switch.desk"), [set("switch.desk", "off")]),
    rule("toggle_on", trigger("switch.desk", "off"), [
      set("switch.desk", "on"),
    ]),
  ];
  add(
    "bounded_feedback",
    "incomplete",
    loop,
    scenario([stateEvent("switch.desk", "on", 0)]),
    "INCONCLUSIVE",
    {},
  );
  for (const [id, replacement] of [
    ["parallel_rejected", "parallel"],
    ["queued_rejected", "queued"],
  ]) {
    const source = stringify(toHaRules(p), { version: "1.1" }).replace(
      "mode: restart",
      `mode: ${replacement}`,
    );
    cases.push({
      id,
      category: "unsupported",
      source,
      entities: p.entities,
      expectations: p.expectations,
      scenario: failure,
      suite,
      label: { status: "UNSUPPORTED", states: {}, repairEligible: false },
    });
  }
  return cases;
}
