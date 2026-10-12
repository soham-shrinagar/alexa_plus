import test from "node:test";
import assert from "node:assert/strict";
import { VoiceController } from "../public/workspace/voice.js";
import {
  followUp,
  concisePlan,
} from "../public/workspace/conversationModel.js";
class Recognition {
  start() {
    this.onstart();
  }
  stop() {
    this.onend();
  }
  abort() {
    this.aborted = true;
  }
}
test("recognition shows editable transcript without submission, handles denial and ignores cancelled callbacks", () => {
  const transcript = [],
    states = [];
  const voice = new VoiceController({
    recognition: Recognition,
    onTranscript: (text, final) => transcript.push({ text, final }),
    onState: (text) => states.push(text),
  });
  voice.start();
  assert.equal(voice.listening, true);
  const result = [{ transcript: "Be at the office by ten" }];
  result.isFinal = true;
  voice.current.onresult({ results: [result] });
  assert.deepEqual(transcript, [
    { text: "Be at the office by ten", final: true },
  ]);
  voice.current.onerror({ error: "not-allowed" });
  assert.equal(voice.listening, false);
  assert.match(states.at(-1), /permission was denied/);
  voice.start();
  const pending = voice.current;
  voice.cancel();
  pending.onresult({ results: [result] });
  assert.equal(transcript.length, 1);
  assert.equal(pending.aborted, true);
});
test("unsupported input retains text fallback; playback is opt-in, non-overlapping and cancellable", () => {
  let cancels = 0;
  const spoken = [];
  const states = [];
  const voice = new VoiceController({
    synthesis: {
      cancel() {
        cancels++;
      },
      speak(utterance) {
        spoken.push(utterance.text);
      },
    },
    Utterance: class {
      constructor(text) {
        this.text = text;
      }
    },
    onState: (text) => states.push(text),
  });
  voice.start();
  assert.match(states[0], /Type your request/);
  voice.speak("Ready");
  assert.equal(spoken.length, 0);
  voice.replay();
  assert.deepEqual(spoken, ["Ready"]);
  voice.enabled = true;
  voice.speak("Next");
  voice.cancel();
  assert.ok(cancels >= 3);
});
test("browser startup and stop races fail safely without submitting a request", () => {
  const states = [];
  const voice = new VoiceController({
    recognition: class extends Recognition {
      start() {
        throw Error("denied");
      }
    },
    onState: (text) => states.push(text),
  });
  voice.start();
  assert.equal(voice.listening, false);
  assert.match(states.at(-1), /Could not start/);
  const pending = new VoiceController({
    recognition: class extends Recognition {
      stop() {
        throw Error("not started");
      }
    },
    onState: (text) => states.push(text),
  });
  pending.start();
  pending.stopListening();
  assert.equal(pending.listening, false);
  assert.match(states.at(-1), /Cancelled/);
});
test("contextual follow-ups distinguish hypothetical comparison, choice, ambiguity and separate review", () => {
  assert.equal(
    followUp("What if traffic is 15 minutes worse?").scenario.events[0].minutes,
    15,
  );
  assert.equal(followUp("What if it rains?").scenario.events[0].type, "RAIN");
  assert.equal(followUp("Choose the second option.").index, 1);
  assert.equal(followUp("Can I start later?").kind, "clarify");
  assert.equal(followUp("What if traffic is bad?").kind, "clarify");
  assert.equal(
    followUp("What if traffic is 99 minutes worse?").kind,
    "clarify",
  );
  assert.equal(followUp("yes").kind, "review");
  assert.equal(followUp("Cancel.").kind, "cancel");
  assert.equal(followUp("Show me the details.").kind, "details");
  assert.equal(followUp("Why is that option blocked?").kind, "why");
  const proposal = { routine: { constraints: Array(9).fill({}), steps: [{}] } };
  assert.match(
    concisePlan(proposal, {
      status: "PASSED",
      summary: { checkedConstraints: 7 },
    }),
    /7 declared rules/,
  );
  assert.match(
    concisePlan(proposal, { status: "FAILED", violations: [{}] }),
    /1 possible conflicts/,
  );
});
