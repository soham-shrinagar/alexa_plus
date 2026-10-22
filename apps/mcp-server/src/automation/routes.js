import { AutomationIdentity } from "./identity.js";
import {
  invokeAutomation,
  requireAutomationUser,
  publicError,
} from "./tools.js";
import { readFileSync } from "node:fs";
import { RequestBudget } from "../rateLimit.js";

export function installAutomationRoutes(
  app,
  { service, tokenService, authenticate, registrationEnabled },
) {
  const example = {
    source: readFileSync(
      new URL(
        "../../../../automation/fixtures/override-debug.yaml",
        import.meta.url,
      ),
      "utf8",
    ),
    snapshot: JSON.parse(
      readFileSync(
        new URL(
          "../../../../automation/fixtures/override-debug.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  };
  const evidence = {
    exported: JSON.parse(
      readFileSync(
        new URL(
          "../../../../automation/reports/phase-5-ha-export.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    semantic: JSON.parse(
      readFileSync(
        new URL(
          "../../../../automation/reports/phase-2-ha.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    repair: JSON.parse(
      readFileSync(
        new URL(
          "../../../../automation/reports/phase-3-ha.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    verification: JSON.parse(
      readFileSync(
        new URL(
          "../../../../automation/reports/phase-3-verification.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  };
  app.get("/automation/example", (_req, res) => res.json(example));
  app.get("/automation/evidence", (_req, res) => res.json(evidence));
  app.get("/automation/guide", (_req, res) =>
    res
      .type("text/plain")
      .send(
        readFileSync(
          new URL("../../../../automation/overview.md", import.meta.url),
          "utf8",
        ),
      ),
  );
  const identity = new AutomationIdentity({
    store: service.store,
    tokenService,
    registrationEnabled,
  });
  const attempts = new RequestBudget({
    limit: 8,
    windowMs: 60000,
    maxKeys: 1000,
  });
  let pendingPasswords = 0;
  app.post("/automation/session/:action", async (req, res) => {
    if (!["register", "login"].includes(req.params.action))
      return res.status(404).json({ error: { code: "NOT_FOUND" } });
    if (!attempts.take(req.ip) || pendingPasswords >= 4)
      return res.status(429).json({
        error: {
          code: "LOGIN_RATE_LIMIT",
          message: "Wait a minute and try again.",
        },
      });
    pendingPasswords++;
    try {
      res.json(
        await identity.session(req.body, req.params.action === "register"),
      );
    } catch (error) {
      const result = publicError(error);
      res.status(result.status).json({ error: result });
    } finally {
      pendingPasswords--;
    }
  });
  app.post("/automation/api/:operation", authenticate, async (req, res) => {
    try {
      res.json(
        await invokeAutomation(
          service,
          requireAutomationUser(req.auth),
          req.params.operation,
          req.body,
        ),
      );
    } catch (error) {
      const result = publicError(error);
      res.status(result.status).json({ error: result });
    }
  });
}
