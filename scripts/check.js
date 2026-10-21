import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directories = ["apps/mcp-server/src", "apps/mcp-server/public", "apps/mcp-server/test", "apps/mcp-server/scripts", "scripts"];
const files = directories.flatMap((directory) => listJavaScript(path.join(root, directory)));
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Syntax checked ${files.length} JavaScript files.`);

function listJavaScript(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listJavaScript(fullPath) : entry.name.endsWith(".js") ? [fullPath] : [];
  });
}
