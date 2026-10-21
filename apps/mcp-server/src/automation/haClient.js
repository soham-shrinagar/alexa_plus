/** Read-only adapter. Tokens remain in this server-side object, never returned. */
export class HomeAssistantReader {
  #base;
  #token;
  #fetch;
  constructor({ url, token, fetchImpl = fetch }) {
    const base = new URL(url);
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== "/"
    )
      throw new Error("Use a plain Home Assistant origin");
    if (
      base.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
    )
      throw new Error("Remote Home Assistant requires HTTPS");
    if (!token) throw new Error("Home Assistant token is required");
    this.#base = base;
    this.#token = token;
    this.#fetch = fetchImpl;
  }
  async #get(path) {
    const response = await this.#fetch(new URL(path, this.#base), {
      method: "GET",
      redirect: "error",
      headers: { Authorization: `Bearer ${this.#token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new Error(`Home Assistant read failed (${response.status})`);
    let text;
    if (response.body?.getReader) {
      const reader = response.body.getReader(),
        chunks = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 2_000_000) {
            await reader.cancel();
            throw new Error("Home Assistant response exceeds limit");
          }
          chunks.push(value);
        }
        text = Buffer.concat(chunks, bytes).toString("utf8");
      } finally {
        reader.releaseLock();
      }
    } else {
      // Minimal injected test adapters may expose text() only.
      text = await response.text();
      if (Buffer.byteLength(text, "utf8") > 2_000_000)
        throw new Error("Home Assistant response exceeds limit");
    }
    return JSON.parse(text);
  }
  async snapshot(ids) {
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 100 ||
      ids.some(
        (id) =>
          !/^(input_boolean|binary_sensor|light|switch)\.[a-z0-9_]+$/.test(id),
      )
    )
      throw new Error("Supply 1..100 supported entity IDs");
    const states = await this.#get("/api/states");
    if (!Array.isArray(states))
      throw new Error("Invalid Home Assistant states response");
    const selected = states
      .filter((s) => ids.includes(s.entity_id))
      .map((s) => ({
        entityId: s.entity_id,
        state: s.state,
        brightness: s.attributes?.brightness,
        observedAt: s.last_updated,
        context: s.context ?? null,
      }));
    return {
      source: "HOME_ASSISTANT",
      states: selected,
      missing: ids.filter((id) => !selected.some((s) => s.entityId === id)),
    };
  }
}
