export class McpBrowserClient {
  constructor({ onActivity = () => {} } = {}) {
    this.onActivity = onActivity;
    this.id = 0;
    this.sessionId = null;
    this.token = null;
  }

  async connect() {
    const saved = readSession();
    if (saved && saved.expiresAt > Date.now() + 30000) {
      this.token = saved.accessToken;
      try {
        const initialized = await this.request(
          "initialize",
          {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "rehearse-web", version: "2.0.0" },
          },
          false,
        );
        await this.notify("notifications/initialized");
        this.onActivity(
          "initialize",
          `Resumed user session · ${initialized.protocolVersion}`,
        );
        return initialized;
      } catch {
        this.token = null;
        this.sessionId = null;
        try {
          sessionStorage.removeItem("rehearse-demo-session");
        } catch {
          /* Storage may be disabled. */
        }
      }
    }
    const session = await fetch("/demo/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!session.ok)
      throw new Error(
        "The local demo session is unavailable. Ensure DEMO_MODE=true.",
      );
    const credentials = await session.json();
    this.token = credentials.accessToken;
    try {
      sessionStorage.setItem(
        "rehearse-demo-session",
        JSON.stringify({
          accessToken: credentials.accessToken,
          expiresAt: Date.now() + credentials.expiresIn * 1000,
        }),
      );
    } catch {
      /* Storage can be disabled; in-memory mode still works. */
    }
    const initialized = await this.request(
      "initialize",
      {
        protocolVersion: credentials.protocolVersion,
        capabilities: {},
        clientInfo: { name: "rehearse-web", version: "1.0.0" },
      },
      false,
    );
    await this.notify("notifications/initialized");
    this.onActivity("initialize", `Negotiated ${initialized.protocolVersion}`);
    return initialized;
  }

  async listTools() {
    const result = await this.request("tools/list", {});
    this.onActivity("tools/list", `${result.tools.length} tools discovered`);
    return result.tools;
  }

  async callTool(name, args = {}) {
    const started = performance.now();
    const result = await this.request("tools/call", { name, arguments: args });
    const value =
      result.structuredContent ?? JSON.parse(result.content?.[0]?.text ?? "{}");
    this.onActivity("tools/call", `${name} · ${Math.round(performance.now()-started)} ms browser round trip`);
    if (result.isError)
      throw Object.assign(new Error(value.error?.message ?? `${name} failed`), {
        code: value.error?.code,
      });
    return value;
  }

  async request(method, params, includeSession = true) {
    const response = await fetch("/mcp", {
      method: "POST",
      headers: this.headers(includeSession),
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
    });
    if (response.status === 401)
      throw new Error(
        "Your demo session expired or the server restarted. Reload to start a new session; no failed action was repeated.",
      );
    if (!response.ok)
      throw new Error(`MCP ${method} failed with HTTP ${response.status}`);
    if (!this.sessionId)
      this.sessionId = response.headers.get("mcp-session-id");
    const message = await response.json();
    if (message.error)
      throw new Error(message.error.message ?? "MCP request failed");
    return message.result;
  }

  async notify(method) {
    const response = await fetch("/mcp", {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ jsonrpc: "2.0", method }),
    });
    if (!response.ok)
      throw new Error(`MCP notification failed with HTTP ${response.status}`);
  }
  headers(includeSession) {
    return {
      authorization: `Bearer ${this.token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      ...(includeSession && this.sessionId
        ? { "mcp-session-id": this.sessionId }
        : {}),
    };
  }
}
function readSession() {
  try {
    return JSON.parse(
      sessionStorage.getItem("rehearse-demo-session") ?? "null",
    );
  } catch {
    return null;
  }
}
