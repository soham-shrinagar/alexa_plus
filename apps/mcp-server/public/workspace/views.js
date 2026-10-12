import { state } from "./state.js";
import { $, element, badge } from "./dom.js";
import { describeChange, describeEvent, formatFacts } from "./decisionModel.js";
export const pageCopy = {
  plan: [
    "The intention",
    "Plan a day that works.",
    "Start with the outcome. Add the context. See how the whole plan fits.",
  ],
  rehearse: [
    "The rehearsal",
    "See what a change would cost.",
    "Keep the requirements visible. Compare a workable response before choosing.",
  ],
  saved: [
    "Your workspace",
    "Pick up where you left off.",
    "Review saved plans, accepted alternatives and the decisions behind them.",
  ],
  household: [
    "The context",
    "Your people. Your policies.",
    "Declare only what the plan needs. Keep the household rules in your control.",
  ],
  connections: [
    "The evidence",
    "Know what the plan relies on.",
    "Inspect providers, freshness and the actual tool surface behind this experience.",
  ],
};
export function showPage(view) {
  if (!pageCopy[view]) view = "plan";
  state.view = view;
  document
    .querySelectorAll(".page-view")
    .forEach((node) => (node.hidden = node.id !== `view-${view}`));
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.view === view);
    button.setAttribute(
      "aria-current",
      button.dataset.view === view ? "page" : "false",
    );
  });
  const copy = pageCopy[view];
  $("#page-kicker").textContent = copy[0];
  $("#page-title").textContent = copy[1];
  $("#page-description").textContent = copy[2];
  $("#view-name").textContent = {
    plan: "Plan",
    rehearse: "Rehearse",
    saved: "Saved plans",
    household: "Household",
    connections: "Connections",
  }[view];
  history.replaceState(null, "", `/?view=${view}`);
}
function timelineItem(time, label, detail, depart = false) {
  const row = element("li");
  const content = element("div", null, `event ${depart ? "depart" : ""}`);
  content.append(element("strong", label), element("small", detail));
  row.append(element("time", time), content);
  return row;
}
function timeCell(label, time, focus = false) {
  const cell = element("div");
  cell.append(
    element("span", label),
    element("b", time, `clock ${focus ? "focus" : ""}`),
  );
  return cell;
}
export function renderPlan() {
  const p = state.proposal;
  if (!p) return;
  const r = state.activation?.runtimeState.routine ?? p.routine;
  const j = p.routine.journey;
  const board = $("#plan-board");
  board.replaceChildren();
  $("#plan-status").replaceWith(
    Object.assign(badge(p.status), { id: "plan-status" }),
  );
  const header = element("div", null, "board-header");
  header.append(
    element(
      "p",
      j
        ? `${j.input.date} · ${j.input.timezone} · ${j.input.travelMode}`
        : `${r.context.dataMode === "fixture" ? `Offline fixture · ${r.context.weekday}` : "Household"} · version ${p.version}`,
      "eyebrow",
    ),
    element("h2", r.title),
    element("p", p.goal, "goal-copy"),
  );
  if (r.lineage)
    header.append(element("p", r.lineage.changeSummary, "lineage"));
  board.append(header);
  if (j) {
    const strip = element("div", null, "time-strip");
    strip.append(
      timeCell(
        "Start preparation",
        r.steps.find((step) => step.requiredForDeparture)?.startTime ??
          j.readyTime,
      ),
      timeCell("Leave", r.steps.find((step) => step.departure).startTime, true),
      timeCell("Arrive by", j.arrivalTime),
    );
    board.append(strip);
  }
  const timeline = element("ol", null, "timeline");
  if (j && !state.activation)
    timeline.append(
      timelineItem(
        j.reminderTime,
        "Get-ready reminder",
        "Calendar export available · import required",
      ),
    );
  for (const step of [...r.steps].sort((a, b) => a.startMinute - b.startMinute))
    timeline.append(
      timelineItem(
        step.startTime,
        step.label,
        step.departure
          ? "Begin the estimated journey"
          : `${step.durationMinutes} min · ${step.capability === "manual_task" ? "manual task" : step.capability}`,
        step.departure,
      ),
    );
  if (j)
    timeline.append(
      timelineItem(
        j.arrivalTime,
        "Arrival deadline",
        j.input.destination.label,
      ),
    );
  board.append(timeline);
  if (state.simulation?.violations?.length) {
    const list = element("div", null, "finding-list");
    renderConflicts(state.simulation, list);
    board.append(list);
  }
  if (j) {
    board.append(
      element(
        "p",
        `${j.routeMinutes} min route + ${j.extraDelayMinutes} min accepted contingency + ${j.safetyBufferMinutes} min arrival buffer + ${j.rainBufferMinutes} min rain allowance.${state.activation && r.context.travelDelayMinutes ? ` Simulated extra delay: ${r.context.travelDelayMinutes} min.` : ""}`,
        "formula",
      ),
    );
    const facts = element("div", null, "fact-strip");
    const weather =
      r.context.evidence.find((item) => item.role === "origin-departure") ??
      r.context.evidence.find((item) => item.provider === "Open-Meteo");
    for (const [value, label] of [
      [`${j.routeMinutes} min`, "TomTom route · traffic included"],
      [
        weather ? `${weather.precipitationMm} mm` : "—",
        "Open-Meteo · stored origin forecast",
      ],
      [`${j.safetyBufferMinutes} min`, "Your reserved arrival buffer"],
    ]) {
      const cell = element("div");
      cell.append(element("b", value), element("small", label));
      facts.append(cell);
    }
    board.append(facts);
  } else board.append(element("p", r.explanation ?? p.goal, "formula"));
  renderEvidence(r);
  $("#runtime-panel").hidden = !state.activation;
  $("#runtime-status").textContent = state.activation?.status ?? "";
  $("#runtime-status").className =
    `badge ${state.activation?.status === "SUSPENDED" ? "failed" : "active"}`;
  $("#runtime-copy").textContent =
    state.activation?.status === "SUSPENDED"
      ? "The attempted adaptation conflicts with the approved requirements. Compare recovery plans or restore the previous conditions."
      : "The approved version is scheduled in the virtual runtime. Inject a change to test what happens.";
}
function renderEvidence(r) {
  const target = $("#plan-evidence");
  target.replaceChildren();
  const taskList = element("div", null, "evidence-item");
  taskList.append(
    element("b", "Interpreted tasks"),
    element(
      "p",
      (r.extractedTasks ?? r.steps.map((step) => ({ request: step.label })))
        .map((task) => task.request)
        .join(" · "),
    ),
  );
  target.append(taskList);
  const assumptions = element("div", null, "evidence-item");
  assumptions.append(
    element("b", "Planning assumptions"),
    element("p", (r.assumptions ?? []).join(" ")),
  );
  target.append(assumptions);
  for (const fact of r.context.evidence ?? []) {
    const row = element("div", null, "evidence-item");
    row.append(
      element(
        "b",
        `${fact.provider} · ${fact.role ?? fact.source ?? "provider evidence"}`,
      ),
      element(
        "p",
        fact.provider === "TomTom"
          ? `${fact.travelMinutes} min route · ${(fact.distanceMeters / 1000).toFixed(1)} km · ${fact.delayMinutes} min traffic included.`
          : `${fact.temperatureC}°C · ${fact.precipitationMm} mm precipitation · ${fact.validFor} (${fact.timezone}).`,
      ),
      element(
        "small",
        `${fact.cached ? "Cached" : "Retrieved"} at ${new Date(fact.retrievedAt).toLocaleString()}. ${fact.attribution ?? ""}`,
      ),
    );
    target.append(row);
  }
  if (!r.context.evidence?.length)
    target.append(
      element(
        "p",
        r.context.dataMode === "fixture"
          ? "Labelled fixture data. No external provider was called."
          : "No external provider was needed; environment assumptions are declared.",
        "help",
      ),
    );
  const note = element(
    "p",
    "Forecasts and future traffic are estimates. Verification checks declared constraints. Device execution and injected events are simulated.",
    "help",
  );
  target.append(note);
}
export function renderComparison(onChoose) {
  const result = state.comparison;
  if (!result) return;
  const target = $("#comparison-board");
  target.replaceChildren();
  const header = element("section", null, "comparison-summary");
  header.append(
    element(
      "p",
      result.sourceMode === "runtime"
        ? "Recovery · current runtime"
        : "Counterfactual · original timing",
      "eyebrow",
    ),
    element(
      "h2",
      result.unchanged.status === "PASSED"
        ? "The original timing still fits."
        : "This change breaks the schedule.",
    ),
    element(
      "p",
      `Scenario: ${result.assumptions.extraTravelMinutes} min extra travel · ${result.assumptions.raining ? "rain assumed" : "dry conditions"}${result.assumptions.unavailableCapabilities.length ? ` · unavailable: ${result.assumptions.unavailableCapabilities.join(", ")}` : ""}. The original plan has not changed.`,
    ),
  );
  header.append(
    element(
      "p",
      `Original verification: ${result.baseline.status} · Scenario verification: ${result.unchanged.status}. Hypothetical, not a provider observation.`,
      "verification-line",
    ),
  );
  if (result.appliedEvents?.length)
    header.append(
      element(
        "p",
        result.appliedEvents
          .map((event) => describeEvent(event, result.affectedTasks))
          .join(" · "),
        "scenario-event-list",
      ),
    );
  if (result.affectedTasks?.length)
    header.append(
      element(
        "p",
        `Affected: ${result.affectedTasks.map((task) => `${task.label}${task.originalDurationMinutes !== task.scenarioDurationMinutes ? ` (${task.originalDurationMinutes} → ${task.scenarioDurationMinutes} min)` : ""}`).join(" · ")}`,
        "scenario-affected",
      ),
    );
  for (const warning of result.unsupportedConditions ?? [])
    header.append(element("p", warning, "scenario-affected"));
  if (result.metrics) {
    const metrics = element("div", null, "metric-row");
    for (const [value, label] of [
      [result.metrics.scenarioArrival ?? "Not evaluable", "Scenario arrival estimate"],
      [
        result.metrics.arrivalMarginMinutes == null ? "Required capability missing" : result.metrics.arrivalMarginMinutes < 0
          ? `${Math.abs(result.metrics.arrivalMarginMinutes)} min late`
          : `${result.metrics.arrivalMarginMinutes} min`,
        "Margin to arrival deadline",
      ],
      [
        `${result.metrics.readinessGapMinutes} min`,
        "Preparation gap after advancing departure",
      ],
    ]) {
      const cell = element("div");
      cell.append(element("span", value), element("small", label));
      metrics.append(cell);
    }
    header.append(metrics);
  }
  target.append(header);
  if (result.unchanged.violations.length) {
    const conflicts = element("section", null, "panel conflict-panel");
    conflicts.append(element("h3", "Why this scenario fails"));
    renderConflicts(result.unchanged, conflicts);
    target.append(conflicts);
  }
  const grid = element("div", null, "alternative-grid");
  for (const option of result.options) {
    const card = element("section", null, "panel alternative");
    card.append(
      badge(option.feasible ? "VERIFIED" : "BLOCKED"),
      element("h3", option.title),
      element("p", option.tradeoff),
    );
    if (option.routine?.journey) {
      const j = option.routine.journey;
      const times = element("div", null, "alternative-times");
      for (const [value, label] of [
        [j.readyTime, "Preparation"],
        [j.departureTime, "Departure"],
        [j.arrivalTime, "Arrival"],
        [option.metrics?.scenarioArrival ?? "—", "Estimated arrival"],
      ]) {
        const cell = element("div");
        cell.append(element("b", value), element("small", label));
        times.append(cell);
      }
      card.append(times);
      card.append(
        element(
          "p",
          `${j.safetyBufferMinutes} min safety buffer · ${option.metrics?.arrivalMarginMinutes ?? "—"} min estimated arrival margin.`,
          "help",
        ),
      );
    }
    const diffs = element("ul", null, "diff-list");
    for (const change of option.changes.slice(0, 5))
      diffs.append(element("li", describeChange(change)));
    for (const issue of option.blockers.slice(0, 3))
      diffs.append(element("li", issue.message));
    card.append(diffs);
    if (option.resolution)
      card.append(
        element(
          "p",
          option.resolution.changesDeadline
            ? "Deadline changes only with this explicit choice; trusted household policies remain."
            : "Required tasks and trusted policies remain. No required duration is shortened.",
          "preserved-note",
        ),
      );
    const button = element(
      "button",
      option.feasible
        ? "Choose this alternative ↗"
        : "Policy prevents this choice",
      "button " + (option.feasible ? "primary" : "secondary"),
    );
    button.disabled = !option.feasible || state.busy;
    button.dataset.work = "";
    button.dataset.blocked = String(!option.feasible);
    button.addEventListener("click", () => onChoose(option));
    card.append(button);
    grid.append(card);
  }
  target.append(grid);
  const notes = element("section", null, "panel constraints-note");
  notes.append(
    element("b", "What stays in your control"),
    element(
      "p",
      "Earlier preparation preserves task durations, buffers and earliest-start rules. A later arrival explicitly changes the deadline. A choice becomes a new verified proposal; starting it requires a separate approval.",
    ),
  );
  target.append(notes);
}
function renderConflicts(verification, parent) {
  const facts = verification.summary?.explanation?.conflicts ?? [];
  for (const issue of verification.violations) {
    const finding = element("div", null, "finding blocked");
    finding.append(element("strong", issue.message));
    const detail = facts.find((item) => item.violationId === issue.id);
    if (detail) {
      finding.append(
        element(
          "p",
          `Expected · ${formatFacts(detail.expected)}`,
          "conflict-fact",
        ),
        element(
          "p",
          `Observed in this evaluation · ${formatFacts(detail.observed)}`,
          "conflict-fact",
        ),
      );
      if (detail.limitation)
        finding.append(element("small", detail.limitation));
    }
    parent.append(finding);
  }
}
export function renderSaved(onOpen) {
  const target = $("#saved-plans");
  target.replaceChildren();
  if (!state.plans.length) {
    target.append(
      element(
        "div",
        "No saved plans for this demo identity yet. Create a plan or load the offline benchmark.",
        "panel help",
      ),
    );
    return;
  }
  for (const plan of state.plans) {
    const card = element("article", null, "panel saved-card");
    card.append(
      badge(plan.status),
      element("h3", plan.title),
      element("p", plan.goal),
      element("span", new Date(plan.updatedAt).toLocaleString(), "plan-date"),
    );
    if (plan.parentId)
      card.append(
        element(
          "p",
          "Accepted alternative · linked to its source plan",
          "help",
        ),
      );
    const open = element("button", "Open plan ↗", "button secondary");
    open.dataset.work = "";
    open.addEventListener("click", () => onOpen(plan.id));
    card.append(open);
    target.append(card);
  }
}
const auditNames = {
  PROPOSAL_COMPILED: "Plan created",
  JOURNEY_PLANNED: "Journey grounded in provider data",
  SIMULATION_COMPLETED: "Verification completed",
  PROPOSAL_REPAIRED: "Timing repair attempted",
  PROPOSAL_REVISED: "Explicit instruction applied",
  ACTIVATION_REQUESTED: "Approval requested",
  ROUTINE_ACTIVATED: "Simulated runtime started",
  RUNTIME_ADAPTED: "Disruption or recovery evaluated",
  ROUTINE_ROLLED_BACK: "Runtime stopped and snapshot restored",
  REHEARSAL_ALTERNATIVE_ACCEPTED: "Alternative accepted",
  PREVIOUS_RUNTIME_REPLACED: "Previous runtime replaced after approval",
  ENVIRONMENT_REFRESHED: "Provider context refreshed",
};
export function renderAudit(events) {
  const target = $("#audit-list");
  target.replaceChildren();
  if (!events.length) {
    target.append(element("p", "No events for this plan yet.", "help"));
    return;
  }
  for (const event of events) {
    const row = element("div", null, "audit-event");
    const text = element("div");
    text.append(
      element(
        "strong",
        auditNames[event.type] ?? event.type.replaceAll("_", " ").toLowerCase(),
      ),
    );
    if (event.details?.event)
      text.append(
        element(
          "p",
          `${event.details.event.type.replaceAll("_", " ")} · ${event.details.event.minutes ?? event.details.event.capability ?? event.details.event.raining ?? ""}`,
        ),
      );
    if (event.details?.changeSummary)
      text.append(element("p", event.details.changeSummary));
    if (event.details?.status)
      text.append(element("p", `Verification: ${event.details.status}`));
    row.append(
      element("time", new Date(event.createdAt).toLocaleString()),
      text,
    );
    target.append(row);
  }
}
export function renderConnections() {
  const target = $("#provider-cards");
  target.replaceChildren();
  const health = state.health ?? {};
  const cards = [
    [
      "Gemini",
      health.plannerConfigured ? "Configured" : "Key required",
      "Interprets your outcome, tasks and relevant tools. Structured output is validated before any proposal is saved.",
      "Requests and selected household context go to Gemini.",
    ],
    [
      "TomTom",
      health.trafficConfigured ? "Configured" : "Key required",
      "Searches addresses and estimates a route for your arrival time. Route duration already includes traffic.",
      "Future conditions are predictive. Geocoding results require your selection.",
    ],
    [
      "Open-Meteo",
      "Keyless forecast",
      "Provides hourly precipitation, temperature, weather code and local timezone. Freshness and attribution stay with each plan.",
      "Non-commercial usage limits apply. Weather data by Open-Meteo.com · CC BY 4.0.",
    ],
    [
      "Plan storage",
      health.repositoryMode === "prisma" ? "PostgreSQL / Neon" : "Memory",
      "Stores plans, verification, alternatives and activity for this identity. Reloading restores the selected plan while its demo session is valid.",
      "This is a local demo identity, not production account login.",
    ],
    [
      "MCP",
      state.connected ? "Connected" : "Disconnected",
      `${state.tools.length} tools discovered over Streamable HTTP. Actual initialize, tools/list and tools/call requests power this workspace.`,
      "Protocol 2025-11-25. Provider credentials stay on the server.",
    ],
    [
      "Alexa+",
      "Simulation",
      "This web experience demonstrates the planning and recovery tool surface. No Echo or physical device is connected.",
      "Amazon preview access, production account linking and latency work remain prerequisites for a real add-on.",
    ],
  ];
  for (const [name, status, copy, note] of cards) {
    const card = element("section", null, "panel provider-card");
    card.append(
      element("span", status, "badge neutral"),
      element("h2", name),
      element("p", copy),
      element("small", note),
    );
    target.append(card);
  }
  $("#tool-count").textContent = `${state.tools.length} tools`;
  $("#tool-catalog").replaceChildren(
    ...state.tools.map((tool) => {
      const row = element("div", null, "tool-item");
      row.append(element("code", tool.name), element("p", tool.description));
      return row;
    }),
  );
}
