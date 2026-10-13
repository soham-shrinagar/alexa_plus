import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { importAutomations, toHaRules } from "../src/automation/importYaml.js";
import { hash } from "../src/automation/schema.js";

const root = process.cwd();
const snapshot = JSON.parse(readFileSync(path.join(root, "automation/fixtures/manual-hold.json"), "utf8"));
const imported = importAutomations(readFileSync(path.join(root, "automation/fixtures/manual-hold.yaml"), "utf8"), snapshot.entities, snapshot.expectations);
if (!imported.project) throw new Error(JSON.stringify(imported.issues));
const cases = snapshot.scenarios.map(scenario => {
  const data = { id: scenario.id, entities: imported.project.entities, rules: toHaRules(imported.project), events: scenario.events, until: scenario.until, expected: { "input_boolean.lamp": "off" } };
  return { ...data, inputHash: hash(data) };
});
mkdirSync("artifacts/automation", { recursive: true });
writeFileSync("artifacts/automation/ha-cases.json", JSON.stringify(cases, null, 2));
console.log(`Wrote ${cases.length} HA cases to ignored artifacts/automation/ha-cases.json`);
