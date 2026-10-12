// Browser adapters are injected for deterministic tests; no paid voice service.
export class VoiceController {
  constructor({
    recognition,
    synthesis,
    Utterance,
    onTranscript = () => {},
    onState = () => {},
  } = {}) {
    this.Recognition = recognition;
    this.synthesis = synthesis;
    this.Utterance = Utterance;
    this.onTranscript = onTranscript;
    this.onState = onState;
    this.listening = false;
    this.lastResponse = "";
    this.enabled = false;
  }
  get inputSupported() {
    return typeof this.Recognition === "function";
  }
  get outputSupported() {
    return Boolean(this.synthesis && this.Utterance);
  }
  start() {
    if (!this.inputSupported) {
      this.onState(
        "Speech input is unavailable in this browser. Type your request.",
      );
      return;
    }
    if (this.listening) return;
    this.stopSpeaking();
    let recognition;
    try {
      recognition = new this.Recognition();
    } catch {
      this.onState("Speech recognition is unavailable. Type your request.");
      return;
    }
    this.current = recognition;
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => {
      if (this.current !== recognition) return;
      this.listening = true;
      this.onState(
        "Listening… Stop when finished; review the transcript before sending.",
      );
    };
    recognition.onresult = (event) => {
      if (this.current !== recognition) return;
      const results = Array.from(event.results);
      const transcript = results
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript)
        this.onTranscript(
          transcript,
          results.every((result) => result.isFinal),
        );
    };
    recognition.onerror = (event) => {
      if (this.current !== recognition) return;
      this.current = null;
      this.listening = false;
      this.onState(
        ["not-allowed", "service-not-allowed"].includes(event.error)
          ? "Microphone permission was denied. Type your request or change browser permissions yourself."
          : `Speech recognition failed (${event.error ?? "unknown"}). Review any transcript or type; nothing was sent.`,
      );
    };
    recognition.onend = () => {
      if (this.current !== recognition) return;
      this.current = null;
      this.listening = false;
      this.onState("Microphone stopped. Correct the transcript, then send it.");
    };
    this.listening = true;
    try {
      recognition.start();
    } catch {
      this.current = null;
      this.listening = false;
      this.onState("Could not start the microphone. Type your request.");
    }
  }
  stopListening() {
    try {
      this.current?.stop();
    } catch {
      this.cancel();
    }
  }
  cancel() {
    const recognition = this.current;
    this.current = null;
    this.listening = false;
    try {
      recognition?.abort();
    } catch {
      /* Already stopped by the browser. */
    }
    this.stopSpeaking();
    this.onState("Cancelled listening and playback. No approval was granted.");
  }
  stopSpeaking() {
    this.synthesis?.cancel();
  }
  speak(text, { replay = false } = {}) {
    this.lastResponse = String(text).slice(0, 700);
    if ((!this.enabled && !replay) || !this.outputSupported) return;
    if (this.listening && !replay) return;
    if (replay && this.listening) this.stopListening();
    this.stopSpeaking();
    const utterance = new this.Utterance(this.lastResponse);
    utterance.lang = "en-IN";
    utterance.rate = 1;
    utterance.onerror = (event) => {
      if (["canceled", "interrupted"].includes(event?.error)) return;
      this.onState(
        "Speech playback was unavailable. Read the response or try Replay.",
      );
    };
    try {
      this.synthesis.speak(utterance);
    } catch {
      this.onState("Speech playback is unavailable. Text remains visible.");
    }
  }
  replay() {
    if (this.lastResponse) this.speak(this.lastResponse, { replay: true });
  }
}
