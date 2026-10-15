import { existsSync } from "node:fs";
import { loadConfig } from "../apps/mcp-server/src/config.js";

if (existsSync("apps/mcp-server/.env"))
  process.loadEnvFile("apps/mcp-server/.env");
const checks = [];
const add = (name, passed, required = true) =>
  checks.push({ name, passed, required });
try {
  const config = loadConfig();
  add("Valid application configuration", true);
  const production = process.argv.includes("--production");
  add(
    "Gemini configured for conversation",
    Boolean(config.geminiApiKey),
    false,
  );
  add(
    "Persistent database configured",
    config.repositoryMode === "prisma",
    production,
  );
  add(
    "Stable signing secret supplied",
    Boolean(process.env.JWT_SECRET?.length >= 32),
    production,
  );
  if (production) {
    add("Demo mode disabled", !config.demoMode);
    add("HTTPS public origin", new URL(config.publicUrl).protocol === "https:");
    add("Authentication enabled", config.authRequired);
    add(
      "Account registration closed after provisioning",
      !config.automationRegistrationEnabled,
      false,
    );
    add(
      "Production origin allowed",
      !config.allowedOrigins.size ||
        config.allowedOrigins.has(new URL(config.publicUrl).origin),
    );
  }
} catch {
  add(
    "Valid application configuration (check variable names and requirements in deployment.md)",
    false,
  );
}
console.log(
  JSON.stringify(
    {
      mode: process.argv.includes("--production") ? "production" : "local",
      checks,
      limitations:
        "Checks configuration presence/shape only. No credentials, connection strings or tokens are printed. Does not establish DB connectivity, key validity, TLS availability, or native Alexa access.",
    },
    null,
    2,
  ),
);
if (checks.some((check) => check.required && !check.passed))
  process.exitCode = 1;
