import { CONTRACT_VERSION } from "./schema.js";

/** Independently specified expected outputs. Never derive expected values from the interpreter. */
export function conformanceCases() {
  const project = { version: CONTRACT_VERSION, entities: { "input_boolean.motion": { state: "off" }, "input_boolean.lamp": { state: "off" }, "input_boolean.hold": { state: "off" } }, expectations: [], rules: [{ id: "motion", name: "Motion", mode: "restart", triggers: [{ kind: "state", entityId: "input_boolean.motion", to: "on" }], conditions: [], actions: [{ kind: "set", entityIds: ["input_boolean.lamp"], state: "on" }, { kind: "delay", milliseconds: 600 }, { kind: "set", entityIds: ["input_boolean.lamp"], state: "off" }] }] };
  const motion = at => ({ kind: "state", entityId: "input_boolean.motion", state: "on", at });
  const off = at => ({ ...motion(at), state: "off" });
  const cases = [];
  const add = (id, p, events, until, expected, changes) => cases.push({ project: p, scenario: { id, events, until }, expected, changes });
  add("normal", structuredClone(project), [motion(0)], 900, { "input_boolean.lamp": "off" }, ["on", "off"]);
  add("restart", structuredClone(project), [motion(0), off(100), motion(400)], 800, { "input_boolean.lamp": "on" }, ["on"]);
  const single = structuredClone(project); single.rules[0].mode = "single";
  add("single", single, [motion(0), off(100), motion(400)], 800, { "input_boolean.lamp": "off" }, ["on", "off"]);
  const guarded = structuredClone(project); guarded.rules[0].actions.splice(2, 0, { kind: "condition", condition: { entityId: "input_boolean.hold", state: "off" } });
  add("guarded", guarded, [motion(0), { kind: "state", entityId: "input_boolean.hold", state: "on", at: 250 }], 900, { "input_boolean.lamp": "on" }, ["on"]);
  const event = structuredClone(project); event.rules[0].triggers = [{ kind: "event", eventType: "rehearse_button", data: { room: "hall" } }];
  add("event_filter", event, [{ kind: "event", eventType: "rehearse_button", data: { room: "other" }, at: 0 }, { kind: "event", eventType: "rehearse_button", data: { room: "hall" }, at: 200 }], 1100, { "input_boolean.lamp": "off" }, ["on", "off"]);
  const chain = structuredClone(project);
  chain.rules.push({ id: "chain", name: "Chained", mode: "single", triggers: [{ kind: "state", entityId: "input_boolean.hold", to: "on" }], conditions: [], actions: [{ kind: "set", entityIds: ["input_boolean.motion"], state: "on" }] });
  add("chain", chain, [{ kind: "state", entityId: "input_boolean.hold", state: "on", at: 0 }], 900, { "input_boolean.lamp": "off", "input_boolean.motion": "on" }, ["on", "off"]);
  return cases;
}
