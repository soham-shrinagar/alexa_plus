import { AppError } from "../errors.js";
export function createAuthMiddleware({ tokenService, config }) { return (req, res, next) => { if (!config.authRequired) { req.auth = { userId: "demo-user", scopes: ["mcp:tools"] }; return next(); } const value = req.get("authorization"); if (!value?.startsWith("Bearer ")) return challenge(res, config, "invalid_request", "A Bearer access token is required."); try { req.auth = tokenService.verify(value.slice(7)); next(); } catch (error) { const appError = error instanceof AppError ? error : new AppError("INVALID_TOKEN", "Authentication failed.", { status: 401 }); return challenge(res, config, appError.code.toLowerCase(), appError.message, appError.status); } }; }
function challenge(res, config, code, description, status = 401) {
  // Amazon's preview quickstart currently disallows this header. Keep the
  // standard MCP challenge by default; preview testing opts in explicitly.
  if (!config.alexaAuthCompatibility) res.set("WWW-Authenticate", `Bearer resource_metadata="${config.publicUrl}/.well-known/oauth-protected-resource", error="${code}"`);
  return res.status(status).json({ error: code, error_description: description });
}
