import test from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";
import { request } from "node:http";

// Use native HTTP so the test controls Host exactly as a terminating proxy does.
function proxyRequest(url, { headers = {}, method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers, method }, (response) => {
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("HTTPS public origin works behind a terminating proxy without trusting forwarded headers", async () => {
  const instance = await createApplication({
    config: {
      repositoryMode: "memory",
      publicUrl: "https://workshop.example",
      demoMode: false,
      automationRegistrationEnabled: false,
      authRequired: true,
      jwtSecret: "isolated-test-only-secret-32-characters",
      allowedOrigins: new Set(),
    },
  });
  const server = instance.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const headers = {
      host: "workshop.example",
      origin: "https://workshop.example",
    };
    assert.equal(
      (await proxyRequest(base + "/health", { headers })).status,
      200,
    );
    assert.equal(
      (
        await proxyRequest(base + "/health", {
          headers: {
            ...headers,
            origin: "https://foreign.example",
            "x-forwarded-proto": "https",
          },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await proxyRequest(base + "/health", {
          headers: { ...headers, host: "foreign.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await proxyRequest(base + "/demo/session", { method: "POST", headers }))
        .status,
      404,
    );
    assert.equal(
      (await proxyRequest(base + "/mcp", { method: "POST", headers })).status,
      401,
    );
    const registration = await proxyRequest(
      base + "/automation/session/register",
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          username: "disabled_user",
          password: "unused-test-password",
        }),
      },
    );
    assert.equal(registration.status, 403);
  } finally {
    await instance.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("public URL rejects credential-bearing or path-specific configuration", () => {
  for (const publicUrl of [
    "https://user:password@example.test",
    "https://example.test/app",
    "https://example.test?key=secret",
    "https://example.test/#fragment",
    "ftp://example.test",
  ])
    assert.throws(() => loadConfig({ PUBLIC_URL: publicUrl }));
});
