// Client for this server's JSON-response Streamable HTTP transport.
// Tool calls are never retried after an ambiguous network failure.
export class WorkshopMcp {
  constructor({ fetchImpl = fetch, getToken, onExpired = () => {} } = {}) {
    this.fetch = fetchImpl;
    this.getToken = getToken;
    this.onExpired = onExpired;
    this.sequence = 0;
    this.reset();
  }
  reset() {
    this.session = null;
    this.ready = null;
    this.tools = new Set();
  }
  async rpc(method, params = {}, notification = false) {
    const id = ++this.sequence;
    let response;
    try {
      response = await this.fetch("/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.getToken() ?? ""}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-11-25",
          ...(this.session ? { "mcp-session-id": this.session } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          ...(!notification ? { id } : {}),
          method,
          params,
        }),
        signal: AbortSignal.timeout(90000),
        redirect: "error",
      });
    } catch {
      throw new Error(
        "The server could not be reached. Your editor text is retained. A submitted operation may have finished; restore the project before retrying.",
      );
    }
    if (response.status === 401) {
      this.reset();
      this.onExpired();
      const error = new Error(
        "Your session has expired. Sign in again to restore your saved projects.",
      );
      error.expired = true;
      throw error;
    }
    if (notification && response.status === 202) return;
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      throw new Error(
        "The MCP server returned an unreadable response. Restore the project before retrying.",
      );
    }
    if (!response.ok) {
      const error = new Error(
        envelope.error?.message ??
          envelope.message ??
          "The MCP request could not finish.",
      );
      // Our server returns this only before dispatch, so one fresh-session retry is safe.
      error.invalidSession =
        response.status === 400 && envelope.error === "invalid_session";
      throw error;
    }
    if (envelope.jsonrpc !== "2.0" || envelope.id !== id || envelope.error)
      throw new Error(envelope.error?.message ?? "Invalid MCP response.");
    if (method === "initialize") {
      if (envelope.result?.protocolVersion !== "2025-11-25")
        throw new Error("The server negotiated an unsupported MCP version.");
      this.session = response.headers.get("mcp-session-id");
      if (!this.session)
        throw new Error("The MCP server did not establish a session.");
    }
    return envelope.result;
  }
  async connect() {
    if (!this.ready)
      this.ready = (async () => {
        await this.rpc("initialize", {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "rehearse-workshop", version: "1.0.0" },
        });
        await this.rpc("notifications/initialized", {}, true);
        const catalog = await this.rpc("tools/list");
        this.tools = new Set(catalog.tools.map((tool) => tool.name));
      })().catch((error) => {
        this.reset();
        throw error;
      });
    return this.ready;
  }
  async call(operation, args = {}, retry = true) {
    try {
      await this.connect();
      const name = `automation.${operation}`;
      if (!this.tools.has(name))
        throw new Error("This operation is not advertised by the MCP server.");
      const result = await this.rpc("tools/call", { name, arguments: args });
      if (result.isError) {
        let message = "The automation operation could not finish.";
        try {
          message = JSON.parse(
            result.content.find((c) => c.type === "text").text,
          ).error.message;
        } catch {
          /* Keep a bounded generic error. */
        }
        throw new Error(message);
      }
      if (!result.structuredContent)
        throw new Error("The MCP tool returned no structured result.");
      return result.structuredContent;
    } catch (error) {
      if (error.invalidSession && retry) {
        this.reset();
        return this.call(operation, args, false);
      }
      throw error;
    }
  }
}
