import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { createTokenService } from "./auth/tokenService.js";
import { createAuthMiddleware } from "./auth/middleware.js";
import { OAuthService } from "./auth/oauthService.js";
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
} from "./auth/metadata.js";
import { MemoryRepository } from "./repositories/memoryRepository.js";
import { PrismaRepository } from "./repositories/prismaRepository.js";
import {
  getPrismaClient,
  disconnectPrismaClient,
} from "./repositories/prismaClient.js";
import { RehearseService } from "./services/rehearseService.js";
import { registerTools } from "./tools/registerTools.js";
import { Telemetry, log } from "./observability.js";
import { GeminiProvider } from "./providers/gemini.js";
import { EnvironmentProvider } from "./providers/environment.js";
import { PlannerService } from "./services/plannerService.js";
import { AutomationService } from "./automation/service.js";
import { MemoryAutomationStore, PrismaAutomationStore } from "./automation/store.js";
import { registerAutomationTools } from "./automation/tools.js";
import { installAutomationRoutes } from "./automation/routes.js";

const publicDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public",
);

export async function createApplication(overrides = {}) {
  const config = { ...loadConfig(), ...overrides.config };
  const tokenService = overrides.tokenService ?? createTokenService(config);
  const telemetry = overrides.telemetry ?? new Telemetry();
  const repository =
    overrides.repository ??
    (config.repositoryMode === "prisma"
      ? new PrismaRepository(getPrismaClient())
      : new MemoryRepository());
  const planner =
    overrides.planner ??
    (config.geminiApiKey
      ? new PlannerService(
          new GeminiProvider({
            apiKey: config.geminiApiKey,
            model: config.geminiModel,
            timeoutMs: config.llmTimeoutMs,
          }),
        )
      : undefined);
  const environment =
    overrides.environment ??
    new EnvironmentProvider({ trafficApiKey: config.trafficApiKey });
  const service =
    overrides.service ??
    new RehearseService({ repository, planner, environment });
  const oauth = new OAuthService({ config, tokenService });
  const app = express();
  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(originGuard(config));
  app.use(rateLimiter(config));
  app.use(express.urlencoded({ extended: false, limit: "16kb" }));
  app.use(express.json({ limit: "256kb" }));
  const authenticate = createAuthMiddleware({ tokenService, config });
  const automationStore = overrides.automationStore ?? (config.repositoryMode === "prisma" ? new PrismaAutomationStore(getPrismaClient()) : new MemoryAutomationStore());
  const automationProvider = overrides.automationProvider ?? (config.geminiApiKey ? new GeminiProvider({ apiKey: config.geminiApiKey, model: config.geminiModel, timeoutMs: config.llmTimeoutMs }) : undefined);
  const automationService = new AutomationService({ store: automationStore, provider: automationProvider });
  installAutomationRoutes(app, { service: automationService, tokenService, authenticate, registrationEnabled: config.automationRegistrationEnabled });

  app.get("/.well-known/oauth-authorization-server", (_req, res) =>
    res.json(authorizationServerMetadata(config)),
  );
  app.get("/.well-known/oauth-protected-resource", (_req, res) =>
    res.json(protectedResourceMetadata(config)),
  );
  app.get("/.well-known/oauth-resource-server", (_req, res) =>
    res.json(protectedResourceMetadata(config)),
  );
  app.get("/oauth/authorize", (req, res) => {
    try {
      const outcome = oauth.authorize(req.query);
      if (outcome.redirect) return res.redirect(outcome.redirect);
      return res
        .type("html")
        .send(
          "<!doctype html><title>Rehearse account linking</title><main><h1>Account linking required</h1><p>Sign in through the production identity provider to approve this connection.</p></main>",
        );
    } catch {
      return res
        .status(400)
        .json({
          error: "invalid_request",
          error_description: "The authorization request is invalid.",
        });
    }
  });
  app.post("/oauth/token", (req, res) => {
    try {
      return res.json(oauth.token(req.body, req.get("authorization")));
    } catch (error) {
      const details = error.oauth ?? {
        error: "server_error",
        error_description: "The token request could not be completed.",
        status: 500,
      };
      if (details.status === 401)
        res.set("WWW-Authenticate", 'Basic realm="oauth"');
      return res
        .status(details.status)
        .json({
          error: details.error,
          error_description: details.error_description,
        });
    }
  });
  app.post("/demo/session", (req, res) => {
    if (!config.demoMode) return res.status(404).json({ error: "not_found" });
    const token = tokenService.issue({
      userId: `demo-user-${crypto.randomUUID()}`,
      clientId: "rehearse-web-demo",
      scopes: ["mcp:tools"],
      expiresIn: "30m",
    });
    return res.json({
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: 1800,
      endpoint: "/mcp",
      protocolVersion: "2025-11-25",
    });
  });
  app.get("/health", (_req, res) =>
    res.json({
      status: "ok",
      product: "Rehearse",
      protocolVersion: "2025-11-25",
      demoMode: config.demoMode,
      repositoryMode: config.repositoryMode,
      plannerConfigured: Boolean(planner),
      geminiModel: config.geminiModel,
      weatherProvider: "Open-Meteo",
      trafficConfigured: Boolean(config.trafficApiKey),
      automationStorage: automationStore.mode,
      automationConversationConfigured: Boolean(automationProvider),
      automationRegistrationEnabled: config.automationRegistrationEnabled,
    }),
  );
  app.get("/metrics", authenticate, (req, res) =>
    res.json(telemetry.snapshot(req.auth.userId)),
  );

  const sessions = new Map();
  async function expireSessions() {
    for (const [id, connection] of sessions)
      if (connection.lastUsedAt < Date.now() - config.sessionTtlMs) {
        sessions.delete(id);
        await connection.server.close();
      }
  }
  const sessionCleanup = setInterval(
    () => {
      expireSessions().catch(() => log("session_cleanup_failed"));
    },
    Math.min(config.sessionTtlMs, 60_000),
  );
  sessionCleanup.unref();
  async function createConnection(owner) {
    const server = new McpServer(
      { name: "rehearse-household-mcp", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerTools(server, { service, telemetry });
    registerAutomationTools(server, automationService);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const connection = { server, transport, owner, lastUsedAt: Date.now() };
    transport.onclose = () => sessions.delete(transport.sessionId);
    return connection;
  }

  app.use("/mcp", (req, res, next) => {
    const started = performance.now();
    res.once("finish", () =>
      telemetry.recordMcp({
        userId: req.auth?.userId,
        latencyMs: Math.round((performance.now() - started) * 100) / 100,
      }),
    );
    next();
  });
  app.all("/mcp", authenticate, async (req, res, next) => {
    try {
      await expireSessions();
      const sessionId = req.get("mcp-session-id");
      let connection = sessionId ? sessions.get(sessionId) : undefined;
      const initializing =
        !connection && req.body?.method === "initialize" && !sessionId;
      if (initializing && sessions.size >= config.maxSessions)
        return res.status(503).json({ error: "session_capacity_exceeded" });
      const owner = `${req.auth.userId ?? "service"}:${req.auth.clientId ?? "demo"}`;
      if (initializing) connection = await createConnection(owner);
      if (!connection)
        return res
          .status(400)
          .json({
            error: "invalid_session",
            message: "Initialize first or supply a valid Mcp-Session-Id.",
          });
      if (connection.owner !== owner)
        return res.status(403).json({ error: "session_owner_mismatch" });
      connection.lastUsedAt = Date.now();
      await connection.transport.handleRequest(req, res, req.body);
      if (initializing && connection.transport.sessionId)
        sessions.set(connection.transport.sessionId, connection);
    } catch (error) {
      next(error);
    }
  });

  app.get(["/", "/automations"], (_req, res) => res.sendFile(path.join(publicDirectory, "automation.html")));
  app.get("/dayboard", (_req, res) => res.sendFile(path.join(publicDirectory, "index.html")));
  app.use(
    express.static(publicDirectory, {
      extensions: ["html"],
      maxAge: config.demoMode ? 0 : "1h",
    }),
  );
  app.use((error, req, res, _next) => {
    const status = [400, 413].includes(error.status) ? error.status : 500;
    log("http_error", { requestId: req.requestId, status });
    res
      .status(status)
      .json({
        error:
          status === 400
            ? "invalid_json"
            : status === 413
              ? "payload_too_large"
              : "internal_error",
        requestId: req.requestId,
      });
  });

  return {
    app,
    config,
    tokenService,
    telemetry,
    repository,
    automationService,
    async close() {
      clearInterval(sessionCleanup);
      await Promise.all(
        [...sessions.values()].map(({ server }) => server.close()),
      );
      if (config.repositoryMode === "prisma" && !overrides.repository)
        await disconnectPrismaClient();
    },
  };
}

function requestContext(req, res, next) {
  req.requestId = req.get("x-request-id") ?? crypto.randomUUID();
  res.set("x-request-id", req.requestId);
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  });
  next();
}

function originGuard(config) {
  return (req, res, next) => {
    const expected = new URL(config.publicUrl);
    const host = req.get("host");
    let hostname;
    try {
      hostname = new URL(`http://${host}`).hostname;
    } catch {
      return res.status(403).json({ error: "host_not_allowed" });
    }
    const isLocal =
      config.demoMode && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
    if (host !== expected.host && !isLocal)
      return res.status(403).json({ error: "host_not_allowed" });
    const origin = req.get("origin");
    const allowed = config.allowedOrigins.size
      ? config.allowedOrigins.has(origin)
      : origin === `${req.protocol}://${host}`;
    if (origin && !allowed)
      return res.status(403).json({ error: "origin_not_allowed" });
    next();
  };
}

function rateLimiter(config) {
  const buckets = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const bucket = buckets.get(key) ?? { started: now, count: 0 };
    if (now - bucket.started > config.requestWindowMs)
      Object.assign(bucket, { started: now, count: 0 });
    if (++bucket.count > config.requestLimit)
      return res.status(429).json({ error: "rate_limited" });
    buckets.set(key, bucket);
    next();
  };
}

const launchedFile = process.argv[1];
if (launchedFile && import.meta.url === pathToFileURL(launchedFile).href) {
  const instance = await createApplication();
  const http = instance.app.listen(
    instance.config.port,
    instance.config.host,
    () =>
      log("server_started", {
        endpoint: `${instance.config.publicUrl}/mcp`,
        product: "Rehearse",
        demoMode: instance.config.demoMode,
      }),
  );
  const close = async () => {
    http.close();
    await instance.close();
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
