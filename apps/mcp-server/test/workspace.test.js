import test from "node:test";
import assert from "node:assert/strict";
import { proposalHistory } from "../public/workspace/state.js";

test("workspace restores fixture plans without a model explanation and caps model context", () => {
  const fixture = {
    goal: "Leave by 07:45",
    routine: { title: "Offline benchmark" },
  };
  assert.deepEqual(proposalHistory(fixture), [
    { role: "user", text: fixture.goal },
    { role: "assistant", text: fixture.goal },
  ]);
  const modelPlan = {
    goal: "g".repeat(2100),
    routine: { explanation: "e".repeat(2100) },
  };
  const history = proposalHistory(modelPlan);
  assert.equal(history[0].text.length, 2000);
  assert.equal(history[1].text.length, 2000);
  assert.ok(history[1].text.startsWith("e"));
});

test("dayboard navigation preserves its route and restores history without adding entries", async (t) => {
  const originalGlobals = Object.fromEntries(
    ["document", "location", "history"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  t.after(() => {
    for (const [key, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const elements = new Map();
  globalThis.document = {
    querySelectorAll: () => [],
    querySelector: (selector) => {
      if (!elements.has(selector)) elements.set(selector, {});
      return elements.get(selector);
    },
  };
  globalThis.location = { href: "http://localhost:3000/dayboard" };
  const entries = [];
  let cursor = -1;
  globalThis.history = {
    state: null,
    replaceState(state, _title, url) {
      this.state = state;
      location.href = String(url);
      if (cursor < 0) cursor = 0;
      entries[cursor] = { state, url: location.href };
    },
    pushState(state, title, url) {
      entries.splice(++cursor);
      this.replaceState(state, title, url);
    },
    back() {
      const entry = entries[--cursor];
      this.state = entry.state;
      location.href = entry.url;
    },
  };
  const { showPage } = await import("../public/workspace/views.js");
  showPage("plan");
  assert.equal(new URL(location.href).pathname, "/dayboard");
  assert.equal(elements.get("#navigate-back").disabled, true);
  showPage("saved");
  showPage("saved");
  assert.equal(entries.length, 2, "Selecting the current view must not duplicate history");
  assert.equal(new URL(location.href).searchParams.get("view"), "saved");
  assert.equal(elements.get("#navigate-back").disabled, false);
  showPage("household");
  history.back();
  showPage("saved", { restore: true });
  assert.equal(entries.length, 3, "Restoring Back must leave the Forward entry intact");
  assert.equal(history.state.index, 1);
  assert.equal(document.title, "Saved plans — Rehearse dayboard");
  assert.equal(new URL(location.href).pathname, "/dayboard");
  history.back();
  showPage("plan", { restore: true });
  assert.equal(elements.get("#navigate-back").disabled, true);
});
