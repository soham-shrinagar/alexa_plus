import { WorkshopMcp } from "./mcp.js";

export class WorkshopApi {
  constructor() {
    this.mcp = new WorkshopMcp({
      getToken: () => this.token,
      onExpired: () => this.setSession(null),
    });
    try {
      this.token = sessionStorage.getItem("automation-token");
      this.username = sessionStorage.getItem("automation-username");
    } catch {
      this.token = null;
      this.username = null;
    }
  }
  setSession(session) {
    this.mcp.reset();
    this.token = session?.accessToken ?? null;
    this.username = session?.username ?? null;
    try {
      if (session) {
        sessionStorage.setItem("automation-token", this.token);
        sessionStorage.setItem("automation-username", this.username);
      } else {
        sessionStorage.removeItem("automation-token");
        sessionStorage.removeItem("automation-username");
      }
    } catch {
      /* Private browser mode: the in-memory session remains usable. */
    }
  }
  async request(url, body, authenticated = false) {
    let response;
    try {
      response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(authenticated
            ? { authorization: `Bearer ${this.token ?? ""}` }
            : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(90000),
        redirect: "error",
      });
    } catch {
      throw new Error(
        "The server could not be reached. Your editor text is retained; retry when it is available.",
      );
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        "The server returned an unreadable response. Retry or check the server.",
      );
    }
    if (!response.ok) {
      if (response.status === 401 && authenticated) {
        this.setSession(null);
        const error = new Error(
          "Your session has expired. Sign in again to restore your saved projects.",
        );
        error.expired = true;
        throw error;
      }
      throw new Error(
        result.error?.message ??
          result.error_description ??
          "The request could not finish.",
      );
    }
    return result;
  }
  call(operation, args = {}) {
    return this.mcp.call(operation, args);
  }
}
