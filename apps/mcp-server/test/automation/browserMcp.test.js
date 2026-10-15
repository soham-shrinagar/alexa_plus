import test from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../../src/server.js";
import { WorkshopMcp } from "../../public/automation/mcp.js";

test("actual browser MCP client discovers tools, exports once, and reconnects an expired transport", async () => {
  const application = await createApplication({
    config: {
      repositoryMode: "memory",
      publicUrl: "http://127.0.0.1:0",
      requestLimit: 1000,
      authRequired: true,
      geminiApiKey: undefined,
    },
  });
  const server = application.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let token,
    expired = false;
  const methods = [];
  const client = new WorkshopMcp({
    getToken: () => token,
    onExpired: () => {
      expired = true;
    },
    fetchImpl: (url, options) => {
      methods.push(JSON.parse(options.body).method);
      return fetch(base + url, options);
    },
  });
  try {
    const session = await fetch(`${base}/automation/session/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "browser_mcp",
        password: "only-a-local-test-password",
      }),
    }).then((r) => r.json());
    token = session.accessToken;
    const example = await fetch(`${base}/automation/example`).then((r) =>
      r.json(),
    );
    const imported = await client.call("import", {
      name: "Browser MCP",
      source: example.source,
      ...example.snapshot,
      confirmed: true,
    });
    assert.deepEqual(methods.slice(0, 4), [
      "initialize",
      "notifications/initialized",
      "tools/list",
      "tools/call",
    ]);
    const projectId = imported.workspace.id;
    const run = await client.call("preflight", { projectId });
    const candidateId = run.analysis.candidates.find((c) => c.eligible).id;
    const review = await client.call("review", {
      projectId,
      candidateId,
      expectedVersion: 1,
    });
    const approval = {
      projectId,
      approvalId: review.approvalId,
      expectedVersion: 1,
      confirmed: true,
    };
    assert.equal((await client.call("export", approval)).installed, false);
    await assert.rejects(client.call("export", approval));
    client.session = "expired-session";
    assert.equal((await client.call("get", { projectId })).id, projectId);
    assert.equal(methods.filter((m) => m === "initialize").length, 2);
    token = "expired-token";
    await assert.rejects(client.call("list"), (error) => error.expired);
    assert.equal(expired, true);
  } finally {
    await application.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("browser MCP client does not replay ambiguous writes or malformed responses", async () => {
  let calls = 0;
  const client = new WorkshopMcp({
    getToken: () => "test",
    fetchImpl: async () => {
      calls++;
      throw new Error("connection reset");
    },
  });
  client.ready = Promise.resolve();
  client.tools.add("automation.export");
  await assert.rejects(client.call("export"), /may have finished/);
  assert.equal(calls, 1);
  client.fetch = async () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: -1, result: {} }));
  await assert.rejects(client.call("export"), /Invalid MCP response/);
});
