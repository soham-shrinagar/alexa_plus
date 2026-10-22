import test from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../src/server.js";
import { RequestBudget } from "../src/rateLimit.js";
import { OAuthService } from "../src/auth/oauthService.js";
import { invokeAutomation } from "../src/automation/tools.js";

test("request budgets bound distinct clients, retain active limits and reclaim expired entries", () => {
  let now = 0;
  const budget = new RequestBudget({
    limit: 2,
    windowMs: 1000,
    maxKeys: 2,
    now: () => now,
  });
  assert.equal(budget.take("alice"), true);
  assert.equal(budget.take("alice"), true);
  assert.equal(budget.take("alice"), false);
  now = 500;
  assert.equal(budget.take("bob"), true);
  assert.equal(budget.take("third"), false);
  assert.equal(budget.take("alice"), false);
  now = 1000;
  assert.equal(budget.take("third"), true);
  assert.equal(budget.take("bob"), true);
  assert.equal(budget.take("bob"), false);
  now = 2000;
  assert.equal(budget.take("alice"), true);
  assert.equal(budget.buckets.size, 1);
});

test("HTTP hardening blocks executable injection and request IDs cannot reflect arbitrary text", async () => {
  const { base, close } = await fixture();
  try {
    const page = await fetch(base + "/automations", {
      headers: { "x-request-id": "untrusted request <script>" },
    });
    assert.equal(page.status, 200);
    const policy = page.headers.get("content-security-policy");
    assert.match(policy, /script-src 'self'/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, /object-src 'none'/);
    assert.doesNotMatch(policy, /script-src[^;]*'unsafe-/);
    assert.equal(page.headers.get("x-frame-options"), "DENY");
    assert.match(page.headers.get("x-request-id"), /^[a-f0-9-]{36}$/);
    assert.equal(
      (
        await fetch(base + "/health", {
          headers: { "x-request-id": "review-123" },
        })
      ).headers.get("x-request-id"),
      "review-123",
    );
    for (const operation of ["constructor", "__proto__", "toString"])
      await assert.rejects(invokeAutomation({}, "owner", operation, {}), {
        code: "UNKNOWN_OPERATION",
      });
  } finally {
    await close();
  }
});

test("concurrent MCP initialization respects capacity and a malformed initialize does not consume it", async () => {
  const api = await fixture({ maxSessions: 1 });
  try {
    const rejected = await api.initialize({});
    assert.equal(rejected.status, 400);
    await rejected.text();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => api.initialize()),
    );
    assert.equal(responses.filter((r) => r.status === 200).length, 1);
    assert.equal(responses.filter((r) => r.status === 503).length, 7);
    const accepted = responses.find((r) => r.status === 200);
    await Promise.all(responses.map((r) => r.text()));
    const deleted = await fetch(api.base + "/mcp", {
      method: "DELETE",
      headers: {
        ...api.headers,
        "mcp-session-id": accepted.headers.get("mcp-session-id"),
      },
    });
    assert.equal(deleted.status, 200);
    await deleted.text();
    const replacement = await api.initialize();
    assert.equal(replacement.status, 200);
    await replacement.text();
  } finally {
    await api.close();
  }
});

test("unused demo OAuth codes have a fixed capacity and expired entries are reclaimed", () => {
  const oauth = new OAuthService({
    config: {
      demoMode: true,
      publicUrl: "http://localhost",
      oauthClients: [
        {
          id: "client",
          secret: "private",
          redirectUris: ["https://client.example/callback"],
        },
      ],
    },
    tokenService: {},
  });
  const params = {
    client_id: "client",
    response_type: "code",
    resource: "http://localhost/mcp",
    redirect_uri: "https://client.example/callback",
    code_challenge_method: "S256",
    code_challenge: "a".repeat(43),
    scope: "mcp:tools",
    approved: "true",
    demo_user: "test",
  };
  for (let i = 0; i < 1000; i++) oauth.authorize(params);
  assert.throws(
    () => oauth.authorize(params),
    (error) => error.oauth.error === "temporarily_unavailable",
  );
  for (const record of oauth.codes.values()) record.expiresAt = 0;
  assert.ok(oauth.authorize(params).redirect);
  assert.equal(oauth.codes.size, 1);
});

test("OAuth rejects invalid grants, resources, scope types and PKCE instead of returning HTTP success", async () => {
  const api = await fixture({
    oauthClients: [
      {
        id: "client",
        secret: "test-secret",
        redirectUris: ["https://client.example/callback"],
      },
    ],
  });
  const headers = {
    authorization: `Basic ${Buffer.from("client:test-secret").toString("base64")}`,
    "content-type": "application/json",
  };
  const request = (body) =>
    fetch(api.base + "/oauth/token", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  try {
    for (const [body, status, error] of [
      [{ grant_type: "refresh_token" }, 400, "unsupported_grant_type"],
      [
        {
          grant_type: "client_credentials",
          resource: "https://foreign.example/mcp",
          scope: "mcp:service",
        },
        403,
        "access_denied",
      ],
      [
        {
          grant_type: "client_credentials",
          resource: "http://127.0.0.1:0/mcp",
          scope: ["mcp:service"],
        },
        400,
        "invalid_scope",
      ],
      [
        {
          grant_type: "authorization_code",
          resource: "http://127.0.0.1:0/mcp",
          code: "not-issued",
          code_verifier: "a".repeat(64),
        },
        400,
        "invalid_grant",
      ],
    ]) {
      const response = await request(body);
      assert.equal(response.status, status);
      const result = await response.json();
      assert.equal(result.error, error);
      assert.equal(result.access_token, undefined);
    }
    const params = new URLSearchParams({
      client_id: "client",
      response_type: "code",
      resource: "http://127.0.0.1:0/mcp",
      redirect_uri: "https://client.example/callback",
      code_challenge_method: "S256",
      code_challenge: "invalid",
      scope: "mcp:tools",
      demo_user: "test",
      approved: "true",
    });
    const malformed = await fetch(api.base + "/oauth/authorize?" + params, {
      redirect: "manual",
    });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.headers.get("location"), null);
  } finally {
    await api.close();
  }
});

async function fixture(config = {}) {
  const instance = await createApplication({
    config: {
      repositoryMode: "memory",
      demoMode: true,
      authRequired: true,
      publicUrl: "http://127.0.0.1:0",
      requestLimit: 1000,
      geminiApiKey: undefined,
      ...config,
    },
  });
  const server = instance.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    authorization: `Bearer ${instance.tokenService.issue({ userId: "security-test", scopes: ["mcp:tools"] })}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-11-25",
  };
  return {
    base,
    headers,
    initialize: (
      params = {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "security-test", version: "1" },
      },
    ) =>
      fetch(base + "/mcp", {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params,
        }),
      }),
    async close() {
      await instance.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
