import crypto from "node:crypto";

const USER_SCOPES = new Set(["mcp:tools", "mcp:resources"]);

export class OAuthService {
  constructor({ config, tokenService }) {
    this.config = config;
    this.tokenService = tokenService;
    this.codes = new Map();
  }
  authorize(params) {
    const client = this.client(params.client_id);
    this.validateAuthorizationRequest(params, client);
    if (
      !this.config.demoMode ||
      params.approved !== "true" ||
      !params.demo_user
    )
      return { consentRequired: true };
    const now = Date.now();
    for (const [code, record] of this.codes)
      if (record.expiresAt <= now) this.codes.delete(code);
    if (this.codes.size >= 1000)
      throw oauthError(
        "temporarily_unavailable",
        "Authorization capacity reached; retry later.",
        503,
      );
    const code = crypto.randomBytes(32).toString("base64url");
    this.codes.set(code, {
      clientId: client.id,
      redirectUri: params.redirect_uri,
      userId: `oauth-demo-${crypto.randomUUID()}`,
      scope: normalizeScope(params.scope, USER_SCOPES),
      codeChallenge: params.code_challenge,
      expiresAt: Date.now() + 300_000,
    });
    const redirect = new URL(params.redirect_uri);
    redirect.searchParams.set("code", code);
    if (params.state) redirect.searchParams.set("state", params.state);
    return { redirect: redirect.toString() };
  }
  token(params, authorization) {
    const client = this.authenticateClient(authorization);
    if (!params || typeof params !== "object" || Array.isArray(params))
      throw oauthError("invalid_request", "A token request body is required.");
    if (params.grant_type === "client_credentials")
      return this.clientCredentials(params, client);
    if (params.grant_type === "authorization_code")
      return this.authorizationCode(params, client);
    throw oauthError(
      "unsupported_grant_type",
      "Only authorization_code and client_credentials are supported.",
    );
  }
  clientCredentials(params, client) {
    if (params.resource !== `${this.config.publicUrl}/mcp`)
      throw oauthError(
        "access_denied",
        "The resource parameter does not match this MCP server.",
        403,
      );
    const scopes = normalizeScope(params.scope, new Set(["mcp:service"]));
    if (scopes.length !== 1 || scopes[0] !== "mcp:service")
      throw oauthError(
        "invalid_scope",
        "Client credentials tokens may only contain mcp:service.",
      );
    return {
      access_token: this.tokenService.issue({
        clientId: client.id,
        scopes,
        type: "service",
        expiresIn: "1h",
      }),
      token_type: "Bearer",
      expires_in: 3600,
      scope: scopes.join(" "),
    };
  }
  authorizationCode(params, client) {
    if (params.resource !== `${this.config.publicUrl}/mcp`)
      throw oauthError(
        "access_denied",
        "The resource parameter does not match this MCP server.",
        403,
      );
    const record = this.codes.get(params.code);
    this.codes.delete(params.code);
    if (
      !record ||
      record.expiresAt <= Date.now() ||
      record.clientId !== client.id ||
      record.redirectUri !== params.redirect_uri
    )
      throw oauthError(
        "invalid_grant",
        "The authorization code is invalid or expired.",
      );
    if (
      typeof params.code_verifier !== "string" ||
      !/^[a-zA-Z0-9._~-]{43,128}$/.test(params.code_verifier) ||
      pkce(params.code_verifier) !== record.codeChallenge
    )
      throw oauthError("invalid_grant", "The PKCE code verifier is invalid.");
    return {
      access_token: this.tokenService.issue({
        userId: record.userId,
        clientId: client.id,
        scopes: record.scope,
        type: "user",
        expiresIn: "1h",
      }),
      token_type: "Bearer",
      expires_in: 3600,
      scope: record.scope.join(" "),
    };
  }
  validateAuthorizationRequest(params, client) {
    if (
      params.response_type !== "code" ||
      params.resource !== `${this.config.publicUrl}/mcp` ||
      !client.redirectUris.includes(params.redirect_uri) ||
      params.code_challenge_method !== "S256" ||
      typeof params.code_challenge !== "string" ||
      !/^[a-zA-Z0-9_-]{43}$/.test(params.code_challenge)
    )
      throw new Error("invalid_authorization_request");
    normalizeScope(params.scope, USER_SCOPES);
  }
  authenticateClient(header) {
    if (!header?.startsWith("Basic "))
      throw oauthError(
        "invalid_client",
        "HTTP Basic client authentication is required.",
        401,
      );
    let id;
    let secret;
    try {
      const credentials = Buffer.from(header.slice(6), "base64").toString(
        "utf8",
      );
      const separator = credentials.indexOf(":");
      if (separator < 1) throw new Error("missing_separator");
      id = credentials.slice(0, separator);
      secret = credentials.slice(separator + 1);
    } catch {
      throw oauthError("invalid_client", "Invalid client authentication.", 401);
    }
    const client = this.client(id);
    const expected = Buffer.from(client.secret);
    const supplied = Buffer.from(secret);
    if (
      expected.length !== supplied.length ||
      !crypto.timingSafeEqual(expected, supplied)
    )
      throw oauthError("invalid_client", "Invalid client authentication.", 401);
    return client;
  }
  client(id) {
    const client = this.config.oauthClients.find((item) => item.id === id);
    if (!client)
      throw oauthError("invalid_client", "Unknown OAuth client.", 401);
    return client;
  }
}
function normalizeScope(value, allowed) {
  if (typeof value !== "string")
    throw oauthError(
      "invalid_scope",
      "A space-separated scope string is required.",
    );
  const scopes = (value ?? "").split(" ").filter(Boolean);
  if (!scopes.length || scopes.some((scope) => !allowed.has(scope)))
    throw oauthError("invalid_scope", "The requested scope is not allowed.");
  return [...new Set(scopes)];
}
function pkce(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}
function oauthError(error, error_description, status = 400) {
  const result = new Error(error_description);
  result.oauth = { error, error_description, status };
  return result;
}
