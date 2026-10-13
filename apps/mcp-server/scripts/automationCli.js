import { readFileSync } from "node:fs";
import { importAutomations } from "../src/automation/importYaml.js";
import { simulate } from "../src/automation/engine.js";
import { search, proposeRepairs } from "../src/automation/verification.js";

const [command, yamlPath, snapshotPath] = process.argv.slice(2);
if (
  !["import", "run", "search", "repair"].includes(command) ||
  !yamlPath ||
  !snapshotPath
) {
  console.error(
    "Usage: node apps/mcp-server/scripts/automationCli.js import|run|search|repair rules.yaml snapshot.json",
  );
  process.exitCode = 2;
} else {
  try {
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const result = importAutomations(
      readFileSync(yamlPath, "utf8"),
      snapshot.entities,
      snapshot.expectations,
    );
    const scenarios =
      snapshot.scenarios ?? snapshot.suite?.map((x) => x.scenario);
    const output =
      !result.project || command === "import"
        ? result
        : command === "run"
          ? scenarios.map((s) => simulate(result.project, s))
          : command === "search"
            ? search(result.project, scenarios)
            : proposeRepairs(result.project, snapshot.suite);
    console.log(JSON.stringify(output, null, 2));
    if (result.status !== "SUPPORTED") process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
