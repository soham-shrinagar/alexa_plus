import { parseDocument, LineCounter, visit, isAlias } from "yaml";
import { CONTRACT_VERSION, projectSchema, hash } from "./schema.js";

class Unsupported extends Error {}
function object(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Unsupported(`${label}: expected mapping`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Unsupported(`${label}: unsupported field ${key}`);
  return value;
}
function list(value) { return Array.isArray(value) ? value : [value]; }
function stateCondition(raw) {
  object(raw, ["condition", "entity_id", "state"], "condition");
  if (raw.condition !== "state") throw new Unsupported("Only literal state conditions are supported");
  return { entityId: raw.entity_id, state: raw.state };
}
function normalizeTrigger(raw) {
  object(raw, ["trigger", "platform", "entity_id", "from", "to", "event_type", "event_data"], "trigger");
  if (raw.trigger && raw.platform) throw new Unsupported("Specify trigger or platform, not both");
  const type = raw.trigger ?? raw.platform;
  if (type === "state") {
    object(raw, ["trigger", "platform", "entity_id", "from", "to"], "state trigger");
    return { kind: "state", entityId: raw.entity_id, ...(raw.from !== undefined ? { from: raw.from } : {}), to: raw.to };
  }
  if (type === "event") {
    object(raw, ["trigger", "platform", "event_type", "event_data"], "event trigger");
    return { kind: "event", eventType: raw.event_type, data: raw.event_data ?? {} };
  }
  throw new Unsupported(`Trigger ${type} is outside v1 (including clock/time triggers)`);
}
function duration(raw) {
  let ms;
  if (typeof raw === "number") ms = raw * 1000;
  else if (typeof raw === "string" && /^\d{2}:\d{2}:\d{2}$/.test(raw)) {
    const [h, m, s] = raw.split(":").map(Number);
    if (m > 59 || s > 59) throw new Unsupported("Invalid delay time");
    ms = (h * 3600 + m * 60 + s) * 1000;
  } else {
    object(raw, ["milliseconds", "seconds", "minutes", "hours"], "delay");
    if (Object.values(raw).some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0)) throw new Unsupported("Delay values must be nonnegative numbers");
    ms = (raw.milliseconds ?? 0) + 1000 * (raw.seconds ?? 0) + 60000 * (raw.minutes ?? 0) + 3600000 * (raw.hours ?? 0);
  }
  return ms;
}
function normalizeAction(raw) {
  if (raw?.delay !== undefined) { object(raw, ["delay"], "delay action"); return { kind: "delay", milliseconds: duration(raw.delay) }; }
  if (raw?.condition !== undefined) return { kind: "condition", condition: stateCondition(raw) };
  object(raw, ["action", "service", "target", "data"], "action");
  if (raw.action && raw.service) throw new Unsupported("Specify action or service, not both");
  const match = /^(light|switch|input_boolean)\.turn_(on|off)$/.exec(raw.action ?? raw.service);
  if (!match) throw new Unsupported("Only explicit turn_on/turn_off actions are supported");
  object(raw.target, ["entity_id"], "target");
  object(raw.data ?? {}, match[1] === "light" && match[2] === "on" ? ["brightness"] : [], "action data");
  const entityIds = list(raw.target.entity_id);
  if (entityIds.some(e => typeof e !== "string" || !e.startsWith(`${match[1]}.`))) throw new Unsupported("Action domain must match every target");
  return { kind: "set", entityIds, state: match[2], ...(raw.data?.brightness !== undefined ? { brightness: raw.data.brightness } : {}) };
}

/** Atomic import: unsupported rules are never silently omitted from analysis. */
export function importAutomations(source, entities, expectations = []) {
  const issues = [], sourceMap = Object.create(null);
  const reject = message => ({ status: "UNSUPPORTED", project: null, issues: [{ path: "$", message }], sourceMap, sourceHash: hash(typeof source === "string" ? source : String(source)) });
  if (typeof source !== "string" || Buffer.byteLength(source) > 128000) return reject("YAML must be a string of at most 128 KB");
  const lines = new LineCounter();
  let doc;
  try {
    doc = parseDocument(source, { lineCounter: lines, uniqueKeys: true, strict: true, maxAliasCount: 0 });
    if (doc.errors.length || doc.warnings.length) return reject([...doc.errors, ...doc.warnings].map(e => e.message).join("; "));
    let nodes = 0;
    visit(doc, (key, node, path) => {
      if (++nodes > 10000 || path.length > 25) throw new Unsupported("YAML structure limit exceeded");
      if (isAlias(node) || node?.anchor || node?.tag) throw new Unsupported("Aliases, anchors and explicit tags are unsupported");
      if (typeof node?.value === "string" && /\{\{|\{%|\{#/.test(node.value)) throw new Unsupported("Templates are unsupported");
    });
    const root = doc.toJS({ maxAliasCount: 0 });
    let rules, prefix;
    if (Array.isArray(root)) { rules = root; prefix = []; }
    else if (root?.automation !== undefined) { object(root, ["automation"], "root"); rules = list(root.automation); prefix = ["automation"]; }
    else { rules = [root]; prefix = []; }
    if (rules.length > 40) return reject("At most 40 rules are supported");
    const normalized = rules.map((raw, index) => {
      const path = Array.isArray(root) || Array.isArray(root?.automation) ? [...prefix, index] : prefix;
      try {
        object(raw, ["id", "alias", "description", "mode", "trigger", "triggers", "condition", "conditions", "action", "actions"], "automation");
        for (const key of ["trigger", "condition", "action"]) if (raw[key] !== undefined && raw[`${key}s`] !== undefined) throw new Unsupported(`Ambiguous ${key}/${key}s`);
        const actionsKey = raw.actions !== undefined ? "actions" : "action";
        const actions = raw[actionsKey];
        const positions = [path, ...list(actions).map((_, i) => Array.isArray(actions) ? [...path, actionsKey, i] : [...path, actionsKey])];
        for (const [i, p] of positions.entries()) {
          const node = doc.getIn(p, true);
          sourceMap[i === 0 ? raw.id : `${raw.id}/actions/${i - 1}`] = { path: p, line: node?.range ? lines.linePos(node.range[0]).line : 1 };
        }
        return {
          id: raw.id, name: raw.alias ?? String(raw.id ?? ""), mode: raw.mode ?? "single",
          triggers: list(raw.triggers ?? raw.trigger).map(normalizeTrigger),
          conditions: list(raw.conditions ?? raw.condition ?? []).map(stateCondition),
          actions: list(actions).map(normalizeAction),
        };
      } catch (error) { issues.push({ path: path.join("."), ruleId: String(raw?.id ?? index), message: error.message }); return null; }
    });
    if (issues.length) return { status: "UNSUPPORTED", project: null, issues, sourceMap, sourceHash: hash(source) };
    const parsed = projectSchema.safeParse({ version: CONTRACT_VERSION, entities, rules: normalized, expectations });
    if (!parsed.success) return { status: "UNSUPPORTED", project: null, issues: parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })), sourceMap, sourceHash: hash(source) };
    return { status: "SUPPORTED", project: parsed.data, issues: [], sourceMap, sourceHash: hash(source), projectHash: hash(parsed.data) };
  } catch (error) { return reject(error.message); }
}

export function toHaRules(project) {
  return projectSchema.parse(project).rules.map(rule => ({
    id: rule.id, alias: rule.name, mode: rule.mode,
    triggers: rule.triggers.map(t => t.kind === "state" ? { trigger: "state", entity_id: t.entityId, to: t.to, ...(t.from !== undefined ? { from: t.from } : {}) } : { trigger: "event", event_type: t.eventType, event_data: t.data }),
    conditions: rule.conditions.map(c => ({ condition: "state", entity_id: c.entityId, state: c.state })),
    actions: rule.actions.map(a => a.kind === "delay" ? { delay: { milliseconds: a.milliseconds } } : a.kind === "condition" ? { condition: "state", entity_id: a.condition.entityId, state: a.condition.state } : { action: `${a.entityIds[0].split(".")[0]}.turn_${a.state}`, target: { entity_id: a.entityIds }, ...(a.brightness !== undefined ? { data: { brightness: a.brightness } } : {}) }),
  }));
}
