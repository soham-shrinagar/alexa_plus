import crypto from "node:crypto";

export function loadConfig(env = process.env) {
  const demoMode = env.DEMO_MODE !== "false";
  const port = integer(env.PORT, 3000, "PORT", 0, 65535);
  const publicUrl = (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, "");
  const url = new URL(publicUrl);
  if (!demoMode && url.protocol !== "https:") throw new Error("PUBLIC_URL must use HTTPS outside demo mode.");
  const repositoryMode = env.REPOSITORY_MODE || (env.DATABASE_URL || !demoMode ? "prisma" : "memory");
  if (!["memory", "prisma"].includes(repositoryMode)) throw new Error("REPOSITORY_MODE must be memory or prisma.");
  if (repositoryMode === "prisma" && !env.DATABASE_URL) throw new Error("DATABASE_URL is required when REPOSITORY_MODE=prisma.");
  const authRequired = env.AUTH_REQUIRED !== "false";
  if (!demoMode && !authRequired) throw new Error("Authentication cannot be disabled outside demo mode.");
  const jwtSecret = env.JWT_SECRET || (demoMode ? crypto.randomBytes(32).toString("hex") : undefined);
  if (!demoMode && (!jwtSecret || jwtSecret.length < 32)) throw new Error("JWT_SECRET must contain at least 32 characters outside demo mode.");
  return {
    port, host: env.HOST || "0.0.0.0", publicUrl, demoMode, repositoryMode, authRequired, jwtSecret,
    allowedOrigins: new Set((env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean)),
    oauthClients: parseClients(env.OAUTH_CLIENTS_JSON),
    requestLimit: integer(env.REQUEST_LIMIT, 120, "REQUEST_LIMIT", 1),
    requestWindowMs: integer(env.REQUEST_WINDOW_MS, 60_000, "REQUEST_WINDOW_MS", 1000),
    maxSessions: integer(env.MAX_MCP_SESSIONS, 100, "MAX_MCP_SESSIONS", 1),
    sessionTtlMs: integer(env.MCP_SESSION_TTL_MS, 1_800_000, "MCP_SESSION_TTL_MS", 1000)
  };
}

function integer(value, fallback, name, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value || fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} is outside the supported integer range.`);
  return parsed;
}

function parseClients(value) {
  if (!value) return [];
  try {
    const clients = JSON.parse(value);
    if (!Array.isArray(clients) || clients.some((client) => typeof client.id !== "string" || !client.id || typeof client.secret !== "string" || !client.secret || !Array.isArray(client.redirectUris) || client.redirectUris.some((uri) => typeof uri !== "string" || !URL.canParse(uri)))) throw new Error("Invalid client definition");
    return clients;
  } catch { throw new Error("OAUTH_CLIENTS_JSON must contain registered client IDs, secrets, and valid redirect URIs."); }
}
