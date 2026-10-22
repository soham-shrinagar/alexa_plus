import { z } from "zod";
import { createHash } from "node:crypto";

export const CONTRACT_VERSION = "rehearse-automations/1";
export const entityId = z
  .string()
  .regex(/^(input_boolean|binary_sensor|light|switch)\.[a-z0-9_]+$/);
export const state = z.enum(["on", "off", "unknown", "unavailable"]);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const conditionSchema = z
  .object({ entityId, state: z.enum(["on", "off"]) })
  .strict();
export const entitySchema = z
  .object({
    state,
    brightness: z.number().int().min(0).max(255).optional(),
  })
  .strict();
const primitive = z.union([
  z.string().max(200),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
// Zod intentionally omits __proto__ when constructing objects. Reject it before
// that happens so validation cannot silently widen a literal event filter.
const eventDataSchema = z.record(
  z
    .string()
    .refine(
      (key) => key !== "__proto__",
      "Unsupported event-data key: __proto__",
    ),
  primitive,
);
export const triggerSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("state"),
      entityId,
      from: state.optional(),
      to: state,
    })
    .strict(),
  z
    .object({
      kind: z.literal("event"),
      eventType: z.string().regex(/^[a-zA-Z0-9_]{1,80}$/),
      data: eventDataSchema.default({}),
    })
    .strict(),
]);
export const actionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("set"),
      entityIds: z.array(entityId).min(1).max(20),
      state: z.enum(["on", "off"]),
      brightness: z.number().int().min(0).max(255).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("delay"),
      milliseconds: z.number().int().min(1).max(3600000),
    })
    .strict(),
  z
    .object({ kind: z.literal("condition"), condition: conditionSchema })
    .strict(),
]);
export const ruleSchema = z
  .object({
    id,
    name: z.string().max(200),
    mode: z.enum(["single", "restart"]),
    triggers: z.array(triggerSchema).min(1).max(10),
    conditions: z.array(conditionSchema).max(20),
    actions: z.array(actionSchema).min(1).max(40),
  })
  .strict();
export const expectationSchema = z
  .object({
    id,
    description: z.string().min(1).max(500),
    confirmed: z.literal(true),
    kind: z.enum(["invariant", "final"]),
    when: z.array(conditionSchema).max(10).default([]),
    entityId,
    state: z.enum(["on", "off"]),
    maxBrightness: z.number().int().min(0).max(255).optional(),
  })
  .strict();
export const projectSchema = z
  .object({
    version: z.literal(CONTRACT_VERSION),
    entities: z.record(entityId, entitySchema),
    rules: z.array(ruleSchema).min(1).max(40),
    expectations: z.array(expectationSchema).max(40).default([]),
  })
  .strict()
  .superRefine((p, ctx) => {
    const issue = (message) => ctx.addIssue({ code: "custom", message });
    if (!Object.keys(p.entities).length || Object.keys(p.entities).length > 100)
      issue("Supply 1..100 entities");
    for (const collection of [p.rules, p.expectations])
      if (new Set(collection.map((x) => x.id)).size !== collection.length)
        issue("Duplicate IDs");
    const reference = (key) => {
      if (!Object.hasOwn(p.entities, key)) issue(`Missing entity: ${key}`);
    };
    for (const [key, value] of Object.entries(p.entities))
      if (value.brightness !== undefined && !key.startsWith("light."))
        issue("Brightness belongs to lights only");
    for (const rule of p.rules) {
      rule.triggers
        .filter((t) => t.kind === "state")
        .forEach((t) => reference(t.entityId));
      rule.conditions.forEach((c) => reference(c.entityId));
      for (const action of rule.actions) {
        if (action.kind === "condition") reference(action.condition.entityId);
        if (action.kind === "set") {
          if (new Set(action.entityIds).size !== action.entityIds.length)
            issue("Duplicate action target");
          if (
            new Set(action.entityIds.map((key) => key.split(".")[0])).size !== 1
          )
            issue("Action targets must share a service domain");
          action.entityIds.forEach((key) => {
            reference(key);
            if (key.startsWith("binary_sensor."))
              issue("Binary sensors are inputs, not action targets");
            if (
              action.brightness !== undefined &&
              (!key.startsWith("light.") || action.state !== "on")
            )
              issue("Brightness only supported for light.turn_on");
          });
        }
      }
    }
    for (const e of p.expectations) {
      reference(e.entityId);
      e.when.forEach((c) => reference(c.entityId));
      if (
        e.maxBrightness !== undefined &&
        (!e.entityId.startsWith("light.") || e.state !== "on")
      )
        issue("Brightness expectation requires an on light");
    }
  });
export const inputEventSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("state"),
      at: z.number().int().min(0).max(86400000),
      entityId,
      state,
      brightness: z.number().int().min(0).max(255).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("event"),
      at: z.number().int().min(0).max(86400000),
      eventType: z.string().regex(/^[a-zA-Z0-9_]{1,80}$/),
      data: eventDataSchema.default({}),
    })
    .strict(),
]);
export const scenarioSchema = z
  .object({
    id,
    initial: z.record(entityId, entitySchema).default({}),
    events: z.array(inputEventSchema).max(100),
    until: z.number().int().min(0).max(86400000),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.events.some((e) => e.at > s.until))
      ctx.addIssue({
        code: "custom",
        message: "An event is beyond the scenario horizon",
      });
  });

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export const hash = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");

export function validateScenario(project, raw) {
  const scenario = scenarioSchema.parse(raw);
  for (const key of [
    ...Object.keys(scenario.initial),
    ...scenario.events.filter((e) => e.kind === "state").map((e) => e.entityId),
  ]) {
    if (!Object.hasOwn(project.entities, key))
      throw new Error(`Scenario references unknown entity: ${key}`);
  }
  for (const [key, value] of [
    ...Object.entries(scenario.initial),
    ...scenario.events
      .filter((e) => e.kind === "state")
      .map((e) => [e.entityId, e]),
  ]) {
    if (value.brightness !== undefined && !key.startsWith("light."))
      throw new Error("Brightness belongs to lights only");
  }
  return scenario;
}
