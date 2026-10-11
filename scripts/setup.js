import net from "node:net";
import path from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root,"apps/mcp-server/.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Use a valid PORT before setup.");
const running = await new Promise(resolve => {
  const socket = net.createConnection({host:"127.0.0.1",port});
  socket.setTimeout(1500);
  const finish = value => { socket.destroy(); resolve(value); };
  socket.once("connect",()=>finish(true)); socket.once("error",()=>finish(false)); socket.once("timeout",()=>finish(false));
});
if (running) throw new Error(`Port ${port} is in use. Stop the server with Ctrl+C before setup; a loaded Prisma engine can lock dependency files. No process was stopped and no install was attempted.`);
const hasWindowsEngine = ["node_modules", "apps/mcp-server/node_modules"].some(directory => existsSync(path.join(root, directory, ".prisma/client/query_engine-windows.dll.node")));
if (process.platform !== "win32" && /^\/mnt\/[a-z]\//i.test(root) && hasWindowsEngine) throw new Error("Windows native dependencies were found in this WSL checkout. Use PowerShell here or a separate Linux-side checkout; do not share node_modules across both.");
const npmCli = process.env.npm_execpath;
if (!npmCli || !existsSync(npmCli)) throw new Error("Run this helper with npm run setup so the correct npm executable is available.");
const commands = [["ci"],["--prefix","apps/mcp-server","ci"],["run","prisma:generate"],["test"],["run","check"],["run","prisma:validate"]];
for (const args of commands) {
  console.log(`Running npm ${args.join(" ")}`);
  const result = spawnSync(process.execPath,[npmCli,...args],{cwd:root,stdio:"inherit",env:{...process.env,RUN_NEON_INTEGRATION:"false"}});
  if (result.status !== 0) { console.error("Setup stopped at the first failure. Fix that error before continuing; no database migration/reset was attempted."); process.exit(result.status || 1); }
}
console.log("Setup passed. Start with npm start --prefix apps/mcp-server. Live providers and Neon integration remain explicit opt-in checks.");
