import { readFileSync } from "node:fs";
import { importAutomations } from "../src/automation/importYaml.js";

const [command, yamlPath, snapshotPath] = process.argv.slice(2);
if (command !== "import" || !yamlPath || !snapshotPath) {
  console.error("Usage: node apps/mcp-server/scripts/automationCli.js import rules.yaml snapshot.json"); process.exitCode = 2;
} else {
  try {
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const result = importAutomations(readFileSync(yamlPath, "utf8"), snapshot.entities, snapshot.expectations);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "SUPPORTED") process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
