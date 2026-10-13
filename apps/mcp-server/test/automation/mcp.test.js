import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApplication } from "../../src/server.js";

test("authenticated Streamable HTTP exposes and executes automation workflow across sessions", async () => {
  const application = await createApplication({ config: { repositoryMode: "memory", publicUrl: "http://127.0.0.1:0", requestLimit: 1000, authRequired: true, geminiApiKey: undefined } });
  const server = application.app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const credentials = { username: "mcp_user", password: "test-private-password-123" };
  const sessionRequest = action => fetch(`${base}/automation/session/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(credentials) }).then(r => r.json());
  try {
    const login = await sessionRequest("register"); let token = login.accessToken, session;
    const rpc = async (method, params, id = 1) => {
      const response = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", ...(session ? { "mcp-session-id": session } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
      if (method === "initialize") session = response.headers.get("mcp-session-id");
      return response.json();
    };
    await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "automation-test", version: "1" } });
    assert.ok((await rpc("tools/list", {})).result.tools.some(t => t.name === "automation.preflight"));
    const call = async (name, args) => { const result = await rpc("tools/call", { name, arguments: args }); assert.ok(!result.result.isError, JSON.stringify(result)); return result.result.structuredContent; };
    const snapshot = JSON.parse(readFileSync(new URL("../../../../automation/fixtures/override-debug.json", import.meta.url)));
    const source = readFileSync(new URL("../../../../automation/fixtures/override-debug.yaml", import.meta.url), "utf8");
    const imported = await call("automation.import", { name: "MCP project", source, ...snapshot, confirmed: true });
    const projectId = imported.workspace.id;
    const run = await call("automation.preflight", { projectId });
    assert.equal(run.analysis.baseline.passed, false); assert.ok(run.analysis.candidates.some(c => c.eligible));
    const review = await call("automation.review", { projectId, candidateId: run.analysis.candidates.find(c => c.eligible).id, expectedVersion: 1 });
    const exported = await call("automation.export", { projectId, approvalId: review.approvalId, expectedVersion: 1, confirmed: true });
    assert.ok(exported.content); assert.equal(exported.installed, false);
    token = (await sessionRequest("login")).accessToken; session = undefined;
    await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "automation-resume", version: "1" } });
    assert.equal((await call("automation.get", { projectId })).runs.length, 3);
    const unauthorized = await fetch(`${base}/automation/api/list`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(unauthorized.status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); await application.close(); }
});
