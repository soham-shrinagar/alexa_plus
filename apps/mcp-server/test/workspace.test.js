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
