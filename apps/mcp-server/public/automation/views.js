import { replayStates, eventLabel, parentChain } from "./replay.js";

export const $ = (id) => document.getElementById(id);
export function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
const empty = (target, text) =>
  target.replaceChildren(node("p", text, "empty"));
const button = (text, callback, secondary = true) => {
  const b = node("button", text, `button${secondary ? " secondary" : ""}`);
  b.type = "button";
  b.addEventListener("click", callback);
  return b;
};
export function showTab(name) {
  $("project-details").open = false;
  document.querySelectorAll("[data-tab]").forEach((b) => {
    const active = b.dataset.tab === name;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `tab-${name}`;
  });
}
export function projectsView(projects, currentId, onSelect) {
  $("projects").replaceChildren();
  if (!projects.length) {
    empty($("projects"), "Your first project starts with an import.");
    return;
  }
  for (const project of projects) {
    const b = button("", () => onSelect(project.id));
    b.className = `project-link${project.id === currentId ? " selected" : ""}`;
    b.append(
      node("span", project.name),
      node("small", `Version ${project.version}`),
    );
    $("projects").append(b);
  }
}
export function overviewView(workspace, onReplay, configured) {
  const analysis = workspace.analysis;
  const failures =
    analysis?.baseline.results.filter((r) => !r.passed).length ?? 0;
  const searchFailures = analysis?.explored.counterexamples.length ?? 0;
  const searchIncomplete =
    Boolean(analysis?.explored.truncated) ||
    (analysis?.explored.results.some((r) => r.status === "INCONCLUSIVE") ??
      false);
  $("finding-title").textContent = !analysis
    ? "Ready when you are."
    : failures
      ? "A behavior needs attention."
      : searchFailures
        ? "Timing reveals an interaction."
        : !analysis.baseline.passed || searchIncomplete
          ? "More context is needed."
          : "Your declared checks passed.";
  $("finding-status").textContent = !analysis
    ? "Not checked"
    : failures || searchFailures
      ? "Review findings"
      : !analysis.baseline.passed || searchIncomplete
        ? "Incomplete"
        : "Checked";
  const metrics = analysis
    ? [
        [analysis.baseline.results.length, "Declared regressions"],
        [
          analysis.baseline.results.filter((r) => !r.passed).length,
          "Failed regressions",
        ],
        [analysis.explored.tested, "Timing experiments"],
        [
          analysis.candidates.filter((c) => c.eligible).length,
          "Verified repair candidates",
        ],
      ]
    : [
        [workspace.project.rules.length, "Imported rules"],
        [Object.keys(workspace.project.entities).length, "Selected entities"],
        [workspace.project.expectations.length, "Confirmed expectations"],
        [workspace.suite.length, "Declared regressions"],
      ];
  $("metrics").replaceChildren(
    ...metrics.map(([value, label]) => {
      const div = node("div", undefined, "metric");
      div.append(node("b", value), node("span", label));
      return div;
    }),
  );
  $("model-state").textContent = configured
    ? "Conversation available"
    : "Direct checks available";
  $("messages").replaceChildren();
  for (const message of workspace.conversation) {
    const div = node("div", undefined, `message ${message.role}`);
    div.append(
      node("small", message.role === "user" ? "You" : "Rehearse"),
      node("p", message.text),
    );
    $("messages").append(div);
  }
  $("messages").scrollTop = $("messages").scrollHeight;
  const target = $("findings");
  target.replaceChildren();
  if (!analysis) {
    empty(
      target,
      "Run preflight to test your declared behaviors and explore disruption timing. Every claim will include its scope.",
    );
    return;
  }
  const coverage = node("details", undefined, "coverage-details");
  coverage.append(node("summary", "Assertions & search coverage"));
  let visibleFindings = 0;
  const more = node("details");
  more.append(node("summary", "More findings"));
  for (const result of analysis.baseline.results) {
    for (const finding of result.findings) {
      const div = node("article", undefined, "finding");
      div.append(
        node("span", `${finding.at} ms`, "time"),
        node("h3", finding.description),
        node(
          "p",
          `Expected ${finding.expected}; observed ${finding.actual.state}. Experiment: ${result.scenarioId}.`,
        ),
        button("Follow the causal chain ↗", () =>
          onReplay(result.scenarioId, finding.cause),
        ),
      );
      (visibleFindings++ === 0 ? target : more).append(div);
    }
    for (const assertion of result.assertions.filter((a) => !a.passed))
      coverage.append(
        node(
          "p",
          `${result.scenarioId}: ${assertion.entityId} should finish ${assertion.expected}; observed ${assertion.actual}.`,
          "help",
        ),
      );
    if (result.uncertainties.length)
      coverage.append(
        node(
          "p",
          `${result.scenarioId}: ${result.uncertainties.join("; ")}`,
          "help",
        ),
      );
  }
  if (!analysis.baseline.results.some((r) => !r.passed))
    target.append(
      node(
        "p",
        "The supplied regression assertions passed. This covers these experiments and the declared model.",
        "help",
      ),
    );
  if (visibleFindings > 1) target.append(more);
  if (analysis.baseline.missingExpectations.length)
    coverage.append(
      node(
        "p",
        `Intent not exercised: ${analysis.baseline.missingExpectations.join(", ")}`,
        "help",
      ),
    );
  coverage.append(
    node(
      "p",
      `${analysis.explored.coverage}${analysis.explored.truncated ? " Search was truncated at its experiment limit." : ""}`,
      "help",
    ),
  );
  if (searchFailures && !visibleFindings)
    target.append(
      node(
        "p",
        `${searchFailures} searched experiments broke an expectation. Review the search results below.`,
        "help",
      ),
    );
  if (searchFailures) {
    const searched = node("details");
    searched.append(
      node("summary", "Timing counterexamples"),
      node(
        "pre",
        JSON.stringify(
          analysis.explored.counterexamples.map((r) => ({
            scenario: r.scenario,
            reverseTies: r.reverseTies,
            findings: r.findings,
          })),
          null,
          2,
        ),
      ),
    );
    coverage.append(searched);
  }
  target.append(coverage);
}
export function candidatesView(workspace, onReview, onCompare) {
  const target = $("candidates");
  target.replaceChildren();
  if (!workspace.analysis) {
    empty(
      target,
      "Run preflight first. A repair needs a reproducible failure and a normal-behavior check.",
    );
    return;
  }
  if (!workspace.analysis.candidates.length) {
    empty(
      target,
      "No supported automatic repair was found. Inspect the replay and edit a new source version. The current vocabulary inserts one literal guard for a conditional expectation.",
    );
    return;
  }
  for (const candidate of workspace.analysis.candidates) {
    const article = node(
      "article",
      undefined,
      `candidate${candidate.eligible ? "" : " blocked"}`,
    );
    article.append(
      node(
        "span",
        candidate.eligible ? "Passed declared checks" : "Needs manual work",
        `pill ${candidate.eligible ? "good" : "bad"}`,
      ),
      node(
        "h3",
        `Check ${candidate.edit.condition.entityId} is ${candidate.edit.condition.state}`,
      ),
      node(
        "p",
        `Insert before action ${candidate.edit.actionIndex + 1} in ${candidate.edit.ruleId}. ${candidate.rationale}`,
      ),
    );
    const detail = node("details");
    detail.append(
      node(
        "summary",
        `${candidate.replayed} experiments checked · verification details`,
      ),
      node("p", `${candidate.remaining} unresolved. ${candidate.limitations}`),
    );
    article.append(detail);
    const actions = node("div", undefined, "actions");
    if (candidate.eligible)
      actions.append(
        button("Review exact patch", () => onReview(candidate.id), false),
        button("Replay before & after", () => onCompare(candidate.id)),
      );
    article.append(actions);
    target.append(article);
  }
}
export function regressionTable(verification) {
  const wrap = node("div", undefined, "table-wrap"),
    table = node("table"),
    head = node("tr");
  for (const title of ["Regression", "Expected final behavior", "Result"])
    head.append(node("th", title));
  table.append(head);
  for (const result of verification.results) {
    const row = node("tr");
    row.append(
      node("td", result.scenarioId),
      node(
        "td",
        result.assertions.map((a) => `${a.entityId}: ${a.expected}`).join("; "),
      ),
      node("td", result.passed ? "Passed" : "Failed / incomplete"),
    );
    table.append(row);
  }
  wrap.append(table);
  return wrap;
}
export function reviewView(review) {
  $("review-panel").hidden = false;
  $("confirm-export").checked = false;
  $("export").disabled = true;
  $("patch-before").textContent = review.patch.before;
  $("patch-after").textContent = review.patch.after;
  $("regressions").replaceChildren(regressionTable(review.verification));
  $("review-note").textContent =
    `Version ${review.version}; review expires ${new Date(review.expiresAt).toLocaleTimeString()}. ${review.patch.format} ${review.permission}`;
}
export function replayView(run, index, sourceMap) {
  const target = $("trace");
  target.replaceChildren();
  $("replay-time").textContent = `${run.trace[index]?.at ?? 0} ms`;
  $("replay-position").min = -1;
  $("replay-position").max = Math.max(-1, run.trace.length - 1);
  $("replay-position").value = index;
  $("replay-summary").textContent =
    `${run.scenarioId} · ${run.status} · ${run.coverage.steps} engine steps. ${run.coverage.uncertainties.join("; ") || run.coverage.claim}`;
  $("entity-state").replaceChildren(
    ...Object.entries(replayStates(run, index)).map(([id, value]) => {
      const div = node("div", undefined, `entity ${value.state}`);
      div.append(
        node("strong", id),
        node(
          "span",
          `${value.state}${value.brightness !== undefined ? ` · ${value.brightness}/255` : ""}`,
        ),
      );
      return div;
    }),
  );
  // A moving window keeps feedback-budget traces usable without thousands of DOM nodes.
  const start = Math.max(0, index - 25),
    end = Math.min(run.trace.length, Math.max(60, index + 35));
  if (start > 0 || end < run.trace.length)
    target.append(
      node(
        "p",
        `Showing events ${start + 1}–${end} of ${run.trace.length}. Use the slider to explore the rest.`,
        "help",
      ),
    );
  for (let i = start; i < end; i++) {
    const row = run.trace[i],
      b = node(
        "button",
        undefined,
        `trace-row${i === index ? " selected" : i > index ? " future" : ""}`,
      );
    b.type = "button";
    b.dataset.index = i;
    const detail = node("span");
    detail.append(
      node("strong", eventLabel(row)),
      node(
        "span",
        `#${row.id}${row.sourceKey && sourceMap[row.sourceKey] ? ` · source line ${sourceMap[row.sourceKey].line}` : ""}`,
      ),
    );
    b.append(node("time", `${row.at} ms`), detail);
    target.append(b);
  }
  const chain = parentChain(run, run.trace[index]?.id);
  $("causal-chain").replaceChildren(node("h3", "Why this event happened"));
  if (!chain.length)
    $("causal-chain").append(
      node(
        "p",
        "Initial snapshot. Advance to an event to inspect its cause.",
        "help",
      ),
    );
  for (const row of chain) {
    const div = node("div", undefined, "chain-step");
    div.append(
      node("small", `${row.at} ms · event #${row.id}`),
      node("span", eventLabel(row)),
    );
    if (row.sourceKey && sourceMap[row.sourceKey])
      div.append(
        node("small", `Original source line ${sourceMap[row.sourceKey].line}`),
      );
    $("causal-chain").append(div);
  }
}
export function sourceView(workspace, graph) {
  const grid = node("div", undefined, "context-grid");
  for (const [title, entries] of [
    [
      "Rules",
      workspace.project.rules.map(
        (r) => `${r.name} · ${r.mode} · ${r.actions.length} actions`,
      ),
    ],
    [
      "Confirmed intent",
      workspace.project.expectations.map((e) => e.description),
    ],
  ]) {
    const div = node("div"),
      ul = node("ul");
    div.append(node("h3", title));
    entries.forEach((text) => ul.append(node("li", text)));
    div.append(ul);
    grid.append(div);
  }
  $("context").replaceChildren(grid);
  $("source-lines").textContent = workspace.source
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(3, " ")}  ${line}`)
    .join("\n");
  $("source-context").textContent = JSON.stringify(
    {
      entities: workspace.project.entities,
      expectations: workspace.project.expectations,
      suite: workspace.suite,
    },
    null,
    2,
  );
  $("dependencies").textContent = JSON.stringify(graph, null, 2);
}
export function evidenceView(evidence, projectHash) {
  const target = $("evidence");
  target.replaceChildren();
  target.append(
    node(
      "p",
      evidence.verification.projectHash === projectHash
        ? "This source model matches the recorded manual-override reference project. The captures below reproduce its original and repaired behavior."
        : "The captures below validate reference fixtures. They do not verify this imported project.",
      "help",
    ),
  );
  for (const [title, report] of [
    ["Execution semantics", evidence.semantic],
    ["Repair before & after", evidence.repair],
    ["Actual exported YAML", evidence.exported],
  ]) {
    const article = node("article", undefined, "evidence-card");
    article.append(
      node("h3", title),
      node(
        "p",
        `${report.runtime} ${report.version} · ${report.devices} · captured ${new Date(report.recordedAt).toLocaleString()}`,
      ),
    );
    if (report.actualExportParsedWithHomeAssistantYaml)
      article.append(
        node(
          "p",
          `Actual export parsed with HA YAML semantics and executed. File SHA-256: ${report.exportYamlSha256}`,
          "help",
        ),
      );
    const table = node("table"),
      head = node("tr");
    ["Case", "Observed lamp", "Authenticated observations"].forEach((t) =>
      head.append(node("th", t)),
    );
    table.append(head);
    for (const c of report.cases) {
      const row = node("tr");
      row.append(
        node("td", c.id),
        node("td", c.finalStates["input_boolean.lamp"]),
        node(
          "td",
          `${c.events.length} state events · ${c.assertionsPassed && c.authenticatedWebSocket && c.restRead ? "passed" : "incomplete"}`,
        ),
      );
      table.append(row);
    }
    const wrap = node("div", undefined, "table-wrap");
    wrap.append(table);
    article.append(wrap);
    target.append(article);
  }
}
