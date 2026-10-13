import test from "node:test";
import assert from "node:assert/strict";
import { stringify } from "yaml";
import { importAutomations, toHaRules } from "../../src/automation/importYaml.js";
import { HomeAssistantReader } from "../../src/automation/haClient.js";

const entities = { "input_boolean.motion": { state: "off" }, "light.desk": { state: "off" } };
const rule = { id: "arrival", alias: "Arrival", triggers: [{ trigger: "state", entity_id: "input_boolean.motion", to: "on" }], actions: [{ action: "light.turn_on", target: { entity_id: "light.desk" }, data: { brightness: 100 } }] };
test("YAML normalizes with provenance and roundtrips through supported HA syntax", () => {
  const result = importAutomations(stringify([rule]), entities);
  assert.equal(result.status, "SUPPORTED");
  assert.ok(result.sourceMap["arrival/actions/0"].line > 1);
  assert.deepEqual(importAutomations(stringify(toHaRules(result.project)), entities).project, result.project);
  assert.equal(result.projectHash.length, 64);
});
test("legacy singular keys and constant delays normalize", () => {
  const r = { id: "legacy", trigger: rule.triggers[0], action: [{ delay: "00:00:02" }, { condition: "state", entity_id: "input_boolean.motion", state: "on" }, rule.actions[0]], mode: "restart" };
  const parsed = importAutomations(stringify(r), entities);
  assert.equal(parsed.status, "SUPPORTED"); assert.equal(parsed.project.rules[0].actions[0].milliseconds, 2000);
});
test("unsupported semantics reject the ENTIRE project", () => {
  for (const bad of [
    { ...rule, id: "other", mode: "parallel" },
    { ...rule, id: "other", actions: [{ action: "light.turn_on", target: { area_id: "room" } }] },
    { ...rule, id: "other", triggers: [{ trigger: "time", at: "20:00:00" }] },
    { ...rule, id: "other", conditions: [{ condition: "template", value_template: "{{ true }}" }] },
    { ...rule, id: "other", actions: [{ action: "switch.turn_on", target: { entity_id: "light.desk" } }] },
    { ...rule, id: "other", triggers: [{ trigger: "state", entity_id: "input_boolean.motion", to: "on", for: 10 }] },
  ]) { const r = importAutomations(stringify([rule, bad]), entities); assert.equal(r.status, "UNSUPPORTED"); assert.equal(r.project, null); assert.ok(r.issues.length); }
});
test("malformed, duplicate, aliased, templated and oversized YAML is rejected", () => {
  for (const source of [undefined, null, "id: a\nid: b", "x: &a [1]\ny: *a", "!!python/object/apply:os.system [echo]", "[broken", "#".repeat(128001), stringify([{ ...rule, alias: "{{ unsafe }}" }])]) assert.equal(importAutomations(source, entities).status, "UNSUPPORTED");
  assert.equal(importAutomations(stringify([rule, rule]), entities).status, "UNSUPPORTED");
  assert.equal(importAutomations(stringify([rule]), {}).status, "UNSUPPORTED");
});
test("unconfirmed expectations and silent unknown references are rejected", () => {
  assert.equal(importAutomations(stringify([rule]), entities, [{ id: "e", description: "Keep on", kind: "invariant", confirmed: false, entityId: "light.desk", state: "on" }]).status, "UNSUPPORTED");
});
test("read connector exposes selected states only and never uses write requests", async () => {
  const calls = [];
  const client = new HomeAssistantReader({ url: "http://127.0.0.1:8123", token: "test-secret", fetchImpl: async (url, options) => {
    calls.push({ url: String(url), method: options.method });
    return { ok: true, text: async () => JSON.stringify([{ entity_id: "light.desk", state: "on", attributes: {} }, { entity_id: "light.private", state: "off" }]) };
  }});
  const result = await client.snapshot(["light.desk", "input_boolean.motion"]);
  assert.equal(result.states.length, 1); assert.deepEqual(result.missing, ["input_boolean.motion"]);
  assert.equal(JSON.stringify(result).includes("test-secret"), false); assert.equal(calls[0].method, "GET");
  assert.throws(() => new HomeAssistantReader({ url: "http://example.com", token: "x" }));
});
