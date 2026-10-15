import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Offline checks must not inherit a caller's database/provider configuration.
const env = {
  ...process.env,
  REPOSITORY_MODE: "memory",
  DEMO_MODE: "true",
  AUTH_REQUIRED: "true",
  AUTOMATION_REGISTRATION_ENABLED: "true",
};
for (const key of [
  "DATABASE_URL",
  "GEMINI_API_KEY",
  "TOMTOM_API_KEY",
  "OAUTH_CLIENTS_JSON",
  "JWT_SECRET",
  "PUBLIC_URL",
  "PORT",
  "HOST",
  "ALLOWED_ORIGINS",
  "RUN_NEON_INTEGRATION",
  "AUTOMATION_NEON_TEST",
])
  delete env[key];
const checks = [
  ["Full tests", ["--test"], "apps/mcp-server"],
  ["JavaScript syntax", ["scripts/check.js"]],
  ["Prisma schema", ["scripts/prismaValidate.js"]],
  [
    "Frozen acceptance corpus",
    ["apps/mcp-server/scripts/evaluateAutomation.js"],
  ],
  [
    "Recorded HA semantic comparison",
    [
      "apps/mcp-server/scripts/compareHa.js",
      "automation/reports/phase-2-ha.json",
    ],
  ],
];
for (const [name, args, directory = "."] of checks) {
  console.log(`\nRelease check: ${name}`);
  const result = spawnSync(process.execPath, args, {
    cwd: path.join(root, directory),
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`Release check failed: ${name}`);
    process.exit(result.status ?? 1);
  }
}
console.log(
  "Offline release checks passed. This does not test live providers, deployment, native Alexa, or human usability.",
);
