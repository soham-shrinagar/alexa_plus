export const state = {
  connected: false,
  busy: false,
  profiles: [],
  plans: [],
  tools: [],
  health: null,
  proposal: null,
  simulation: null,
  activation: null,
  comparison: null,
  evidenceAssessment: null,
  history: [],
  places: {},
  view: "plan",
};
export function readPreference(key, fallback = null) {
  try {
    return (
      JSON.parse(sessionStorage.getItem(`rehearse:${key}`) ?? "null") ??
      fallback
    );
  } catch {
    return fallback;
  }
}
export function writePreference(key, value) {
  try {
    sessionStorage.setItem(`rehearse:${key}`, JSON.stringify(value));
  } catch {
    /* In-memory use remains available. */
  }
}
export function rememberPlan(proposal) {
  writePreference("selected-plan", proposal?.id ?? null);
}
// The explicit offline compiler predates LLM explanations. Restoring or
// accepting its plans must not assume a model-produced explanation exists.
export function proposalHistory(proposal) {
  return [
    { role: "user", text: proposal.goal.slice(0, 2000) },
    {
      role: "assistant",
      text: (proposal.routine.explanation ?? proposal.goal).slice(0, 2000),
    },
  ];
}
