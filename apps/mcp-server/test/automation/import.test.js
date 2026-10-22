import test from "node:test";
import assert from "node:assert/strict";
import { stringify as yamlStringify } from "yaml";
const stringify = (value) => yamlStringify(value, { version: "1.1" });
import {
  importAutomations,
  toHaRules,
} from "../../src/automation/importYaml.js";
import { HomeAssistantReader } from "../../src/automation/haClient.js";
import { validateScenario } from "../../src/automation/schema.js";

const entities = {
  "input_boolean.motion": { state: "off" },
  "light.desk": { state: "off" },
};
const rule = {
  id: "arrival",
  alias: "Arrival",
  triggers: [{ trigger: "state", entity_id: "input_boolean.motion", to: "on" }],
  actions: [
    {
      action: "light.turn_on",
      target: { entity_id: "light.desk" },
      data: { brightness: 100 },
    },
  ],
};
test("YAML normalizes with provenance and roundtrips through supported HA syntax", () => {
  const result = importAutomations(stringify([rule]), entities);
  assert.equal(result.status, "SUPPORTED");
  assert.ok(result.sourceMap["arrival/actions/0"].line > 1);
  assert.deepEqual(
    importAutomations(stringify(toHaRules(result.project)), entities).project,
    result.project,
  );
  assert.equal(result.projectHash.length, 64);
});

test("prototype-named event fields reject atomically rather than disappearing from filters or inputs", () => {
  const source = stringify([
    {
      ...rule,
      triggers: [
        {
          trigger: "event",
          event_type: "literal_button",
          event_data: JSON.parse('{"__proto__":"blocked"}'),
        },
      ],
    },
  ]);
  const rejected = importAutomations(source, entities);
  assert.equal(rejected.status, "UNSUPPORTED");
  assert.equal(rejected.project, null);
  const project = importAutomations(stringify([rule]), entities).project;
  assert.throws(
    () =>
      validateScenario(project, {
        id: "literal_input",
        until: 100,
        events: [
          {
            kind: "event",
            eventType: "literal_button",
            at: 0,
            data: JSON.parse('{"__proto__":"blocked"}'),
          },
        ],
      }),
    /Unsupported event-data key/,
  );
});

test("import uses HA YAML boolean semantics and rejects ambiguous state literals and map keys", () => {
  const quoted = stringify([rule]);
  assert.equal(
    importAutomations(quoted.replace('to: "on"', "to: on"), entities).status,
    "UNSUPPORTED",
  );
  assert.equal(
    importAutomations(`%YAML 1.2\n---\n${quoted}`, entities).status,
    "UNSUPPORTED",
  );
  const event = {
    ...rule,
    triggers: [
      {
        trigger: "event",
        event_type: "rehearse_test",
        event_data: { enabled: true },
      },
    ],
  };
  const result = importAutomations(
    stringify([event]).replace("enabled: true", "enabled: yes"),
    entities,
  );
  assert.equal(result.project.rules[0].triggers[0].data.enabled, true);
  assert.equal(
    importAutomations(
      stringify([event]).replace("enabled: true", "on: true"),
      entities,
    ).status,
    "UNSUPPORTED",
  );
});
test("legacy singular keys and constant delays normalize", () => {
  const r = {
    id: "legacy",
    trigger: rule.triggers[0],
    action: [
      { delay: "00:00:02" },
      { condition: "state", entity_id: "input_boolean.motion", state: "on" },
      rule.actions[0],
    ],
    mode: "restart",
  };
  const parsed = importAutomations(stringify(r), entities);
  assert.equal(parsed.status, "SUPPORTED");
  assert.equal(parsed.project.rules[0].actions[0].milliseconds, 2000);
});
test("unsupported semantics reject the ENTIRE project", () => {
  for (const bad of [
    { ...rule, id: "other", mode: "parallel" },
    {
      ...rule,
      id: "other",
      actions: [{ action: "light.turn_on", target: { area_id: "room" } }],
    },
    { ...rule, id: "other", triggers: [{ trigger: "time", at: "20:00:00" }] },
    {
      ...rule,
      id: "other",
      conditions: [{ condition: "template", value_template: "{{ true }}" }],
    },
    {
      ...rule,
      id: "other",
      actions: [
        { action: "switch.turn_on", target: { entity_id: "light.desk" } },
      ],
    },
    {
      ...rule,
      id: "other",
      triggers: [
        {
          trigger: "state",
          entity_id: "input_boolean.motion",
          to: "on",
          for: 10,
        },
      ],
    },
  ]) {
    const r = importAutomations(stringify([rule, bad]), entities);
    assert.equal(r.status, "UNSUPPORTED");
    assert.equal(r.project, null);
    assert.ok(r.issues.length);
  }
});
test("malformed, duplicate, aliased, templated and oversized YAML is rejected", () => {
  for (const source of [
    undefined,
    null,
    "id: a\nid: b",
    "x: &a [1]\ny: *a",
    "!!python/object/apply:os.system [echo]",
    "[broken",
    "#".repeat(128001),
    stringify([{ ...rule, alias: "{{ unsafe }}" }]),
  ])
    assert.equal(importAutomations(source, entities).status, "UNSUPPORTED");
  assert.equal(
    importAutomations(stringify([rule, rule]), entities).status,
    "UNSUPPORTED",
  );
  assert.equal(importAutomations(stringify([rule]), {}).status, "UNSUPPORTED");
});
test("unconfirmed expectations and silent unknown references are rejected", () => {
  assert.equal(
    importAutomations(stringify([rule]), entities, [
      {
        id: "e",
        description: "Keep on",
        kind: "invariant",
        confirmed: false,
        entityId: "light.desk",
        state: "on",
      },
    ]).status,
    "UNSUPPORTED",
  );
});
test("read connector exposes selected states only and never uses write requests", async () => {
  const calls = [];
  const client = new HomeAssistantReader({
    url: "http://127.0.0.1:8123",
    token: "test-secret",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), method: options.method });
      return {
        ok: true,
        text: async () =>
          JSON.stringify([
            { entity_id: "light.desk", state: "on", attributes: {} },
            { entity_id: "light.private", state: "off" },
          ]),
      };
    },
  });
  const result = await client.snapshot(["light.desk", "input_boolean.motion"]);
  assert.equal(result.states.length, 1);
  assert.deepEqual(result.missing, ["input_boolean.motion"]);
  assert.equal(JSON.stringify(result).includes("test-secret"), false);
  assert.equal(calls[0].method, "GET");
  assert.throws(
    () => new HomeAssistantReader({ url: "http://example.com", token: "x" }),
  );
});

test("read connector cancels oversized streaming bodies before buffering the entire response", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(1_000_001));
    },
    cancel() {
      cancelled = true;
    },
  });
  const client = new HomeAssistantReader({
    url: "http://127.0.0.1:8123",
    token: "test-only",
    fetchImpl: async () => new Response(body),
  });
  await assert.rejects(client.snapshot(["light.desk"]), /exceeds limit/);
  assert.equal(cancelled, true);
});
