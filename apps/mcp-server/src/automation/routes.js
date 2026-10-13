import { AutomationIdentity } from "./identity.js";
import { invokeAutomation, requireAutomationUser, publicError } from "./tools.js";

export function installAutomationRoutes(app, { service, tokenService, authenticate, registrationEnabled }) {
  const identity = new AutomationIdentity({ store: service.store, tokenService, registrationEnabled });
  const attempts = new Map(); let pendingPasswords = 0;
  app.post("/automation/session/:action", async (req, res) => {
    if (!["register", "login"].includes(req.params.action)) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    const now = Date.now(), bucket = attempts.get(req.ip) ?? { started: now, count: 0 };
    if (now - bucket.started > 60000) Object.assign(bucket, { started: now, count: 0 });
    if (attempts.size > 1000) for (const [key, b] of attempts) if (now - b.started > 60000) attempts.delete(key);
    attempts.set(req.ip, bucket);
    if (++bucket.count > 8 || pendingPasswords >= 4) return res.status(429).json({ error: { code: "LOGIN_RATE_LIMIT", message: "Wait a minute and try again." } });
    pendingPasswords++;
    try { res.json(await identity.session(req.body, req.params.action === "register")); }
    catch (error) { const result = publicError(error); res.status(result.status).json({ error: result }); }
    finally { pendingPasswords--; }
  });
  app.post("/automation/api/:operation", authenticate, async (req, res) => {
    try { res.json(await invokeAutomation(service, requireAutomationUser(req.auth), req.params.operation, req.body)); }
    catch (error) { const result = publicError(error); res.status(result.status).json({ error: result }); }
  });
}
