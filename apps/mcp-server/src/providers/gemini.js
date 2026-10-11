import { AppError } from "../errors.js";
import { httpJson } from "./httpJson.js";

export class GeminiProvider {
  constructor({ apiKey, model = "gemini-3.5-flash-lite", fetchImpl = fetch, timeoutMs = 45000 } = {}) {
    this.apiKey = apiKey; this.model = model; this.fetch = fetchImpl; this.timeoutMs = timeoutMs;
    this.activeRequests = 0; this.windowStarted = Date.now(); this.windowCount = 0;
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("Invalid GEMINI_MODEL identifier.");
  }
  async generate({ system, input, schema }) {
    if (!this.apiKey) throw new AppError("LLM_NOT_CONFIGURED", "Set GEMINI_API_KEY in the server environment or explicitly choose the deterministic fixture.", { status: 503 });
    if (Date.now() - this.windowStarted >= 60000) { this.windowStarted = Date.now(); this.windowCount = 0; }
    if (this.activeRequests >= 3 || this.windowCount >= 12) throw new AppError("LLM_BUSY", "Gemini's local request budget is busy. Wait a minute before retrying.", { status: 429, retryable: true });
    this.activeRequests++; this.windowCount++;
    try {
      const response = await httpJson(this.fetch, `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
        provider: "Gemini", timeoutMs: this.timeoutMs, method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json", responseSchema: schema } })
      });
      const candidate = response.candidates?.[0];
      if (candidate?.finishReason !== "STOP") throw new AppError("LLM_INCOMPLETE", "Gemini did not finish a usable response. Try a shorter request; no plan was saved.", { status: 503, retryable: true });
      try { return JSON.parse(candidate.content.parts.filter((part) => !part.thought && typeof part.text === "string").map((part) => part.text).join("")); }
      catch { throw new AppError("LLM_INVALID_OUTPUT", "Gemini returned invalid structured output; no plan was saved.", { status: 502 }); }
    } finally { this.activeRequests--; }
  }
}
