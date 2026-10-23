import { WorkshopApi } from "./api.js";
import {
  $,
  node,
  showTab as renderTab,
  projectsView,
  overviewView,
  candidatesView,
  reviewView,
  replayView,
  sourceView,
  evidenceView,
} from "./views.js";
import { VoiceController } from "../workspace/voice.js";

const api = new WorkshopApi();
const tabNames = {
  overview: "Investigation",
  replay: "Replay",
  repair: "Repair",
  source: "Rules & context",
  evidence: "Runtime evidence",
};
const initialParams = new URLSearchParams(location.search);
let currentTab = "overview",
  navigationReady = false,
  restoringNavigation = false,
  navigationIndex = 0,
  currentRoute = null,
  pendingNavigation = null,
  importContext = null;
const mobileLayout = window.matchMedia("(max-width: 760px)");
const resizeWorkspaceMenu = () => {
  $("workspace-switcher").open = !mobileLayout.matches;
};
mobileLayout.addEventListener("change", resizeWorkspaceMenu);
resizeWorkspaceMenu();
let workspace = null,
  projects = [],
  health = null,
  evidence = null,
  review = null;
let busy = false,
  editing = false,
  replays = [],
  replayIndex = -1;
const voice = new VoiceController({
  recognition: window.SpeechRecognition ?? window.webkitSpeechRecognition,
  synthesis: window.speechSynthesis,
  Utterance: window.SpeechSynthesisUtterance,
  onTranscript: (text) => {
    $("message").value = text;
  },
  onState: (text) => {
    $("voice-status").textContent = text;
    $("stop-voice").hidden = !voice.listening;
  },
});

function notice(text, error = false) {
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
  $("notice").classList.toggle("progress", busy && !error);
}
function showTab(name) {
  currentTab = Object.hasOwn(tabNames, name) ? name : "overview";
  renderTab(currentTab);
  updateNavigation();
}
function updateNavigation(replace = false) {
  const importing = !$("import-panel").hidden;
  const view = importing
    ? editing ? "edit" : "import"
    : workspace ? currentTab : "home";
  const label = importing
    ? editing ? "Edit source" : "New project"
    : tabNames[currentTab];
  $("workspace-name").textContent =
    workspace?.name ?? (importing ? "New project" : "Getting started");
  $("workspace-name").disabled =
    !workspace || (!importing && currentTab === "overview");
  $("workspace-name").setAttribute(
    "aria-label",
    workspace ? `Open investigation for ${workspace.name}`
      : importing ? "New project" : "Getting started",
  );
  $("current-view").textContent = label;
  $("current-view").hidden = !workspace;
  $("view-separator").hidden = !workspace;
  $("navigate-home").disabled = !workspace && !importing;
  $("cancel-import").textContent = workspace
    ? `Back to ${tabNames[currentTab].toLowerCase()}` : "Back to workshop";
  $("navigate-back").disabled = !navigationIndex && !workspace && !importing;
  document.title = `${importing || workspace ? label : "Automation workshop"} — Rehearse`;
  if (!navigationReady || restoringNavigation || pendingNavigation) return;
  const route = { projectId: workspace?.id ?? null, view, tab: currentTab };
  if (!replace && JSON.stringify(route) === JSON.stringify(currentRoute)) return;
  if (!replace) navigationIndex++;
  currentRoute = route;
  const url = new URL(location.href);
  url.searchParams.set("view", view);
  if (workspace) url.searchParams.set("project", workspace.id);
  else url.searchParams.delete("project");
  history[replace ? "replaceState" : "pushState"](
    { workshop: true, route, index: navigationIndex },
    "",
    url,
  );
  $("navigate-back").disabled = !navigationIndex && !workspace && !importing;
}
function focusView() {
  const target = !$("import-panel").hidden
    ? $("project-name") : workspace ? $("project-title") : $("intro");
  if (!target.matches("input")) target.tabIndex = -1;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "nearest" });
}
function goHome() {
  if (busy) return;
  workspace = null;
  review = null;
  replays = [];
  $("import-panel").hidden = true;
  projectsView(projects, null, (id) =>
    work("Restoring your project…", () => loadProject(id)),
  );
  screenView();
  notice(api.token
    ? "Choose a saved project or start a new experiment."
    : "Sign in to open your workshop.");
  focusView();
}
function closeImport() {
  if (busy) return;
  if (navigationIndex && ["import", "edit"].includes(currentRoute?.view)) {
    history.back();
    return;
  }
  $("import-panel").hidden = true;
  screenView();
  focusView();
  notice(workspace
    ? "Editor closed. Your saved project is unchanged."
    : "Choose a saved project or start a new experiment.");
}
function flushNavigation() {
  if (busy || restoringNavigation || !pendingNavigation) return;
  const next = pendingNavigation;
  pendingNavigation = null;
  void restoreNavigation(next);
}
async function restoreNavigation(entry) {
  if (busy || restoringNavigation) {
    pendingNavigation = entry;
    return;
  }
  navigationIndex = entry.index;
  currentRoute = entry.route;
  restoringNavigation = true;
  try {
    await work("Opening your previous view…", async () => {
      const route = entry.route;
      if (route.projectId && api.token) {
        if (workspace?.id !== route.projectId) await loadProject(route.projectId);
      } else {
        workspace = null;
        projectsView(projects, null, (id) =>
          work("Restoring your project…", () => loadProject(id)),
        );
      }
      $("import-panel").hidden = true;
      showTab(route.tab ?? route.view);
      if (["import", "edit"].includes(route.view) && api.token)
        openImport(route.view === "edit", true);
      screenView();
      focusView();
      notice(["import", "edit"].includes(route.view) && api.token
        ? "Editor reopened. Your draft is ready to review."
        : workspace ? `Opened ${workspace.name} · ${tabNames[currentTab]}.`
          : "Choose a saved project or start a new experiment.");
    });
  } finally {
    restoringNavigation = false;
    updateNavigation(true);
    flushNavigation();
  }
}
function screenView() {
  const importing = !$("import-panel").hidden;
  document.body.classList.toggle("has-project", Boolean(workspace));
  $("intro").hidden = Boolean(workspace) || importing;
  $("project-panel").hidden = !workspace || importing;
  $("welcome").hidden = !api.token || Boolean(workspace) || importing;
  updateNavigation();
}
function accountView() {
  $("login-panel").hidden = Boolean(api.token);
  $("sign-out").hidden = !api.token;
  $("account-name").textContent = api.username ?? "No account";
  $("storage-note").textContent =
    health?.automationStorage === "prisma"
      ? "Your account and projects are stored in Neon. Sign in again to restore them on another session."
      : "This server uses temporary memory. Accounts and projects are lost when it restarts. Configure Neon for persistence.";
  $("register").hidden = health?.automationRegistrationEnabled === false;
  screenView();
}
function resetSession() {
  navigationReady = false;
  navigationIndex = 0;
  pendingNavigation = null;
  api.setSession(null);
  workspace = null;
  projects = [];
  review = null;
  replays = [];
  $("project-panel").hidden = true;
  $("import-panel").hidden = true;
  $("welcome").hidden = false;
  $("workspace-name").textContent = "Getting started";
  $("projects").replaceChildren(
    node("p", "Sign in to restore your projects.", "rail-empty"),
  );
  accountView();
  voice.cancel();
  navigationReady = true;
  updateNavigation(true);
}
async function work(message, action) {
  if (busy) return;
  busy = true;
  document.body.classList.add("working");
  $("workspace").setAttribute("aria-busy", "true");
  notice(message);
  try {
    await action();
  } catch (error) {
    if (error.expired) resetSession();
    notice(error.message, true);
  } finally {
    busy = false;
    document.body.classList.remove("working");
    $("workspace").removeAttribute("aria-busy");
    $("notice").classList.remove("progress");
    flushNavigation();
  }
}
function requireLogin() {
  if (api.token) return true;
  notice("Sign in or create an account to save this project.");
  $("username").focus();
  return false;
}
async function refreshProjects() {
  projects = (await api.call("list")).projects;
  projectsView(projects, workspace?.id, (id) =>
    work("Restoring your project…", () => loadProject(id)),
  );
}
function selectReplay(scenarioId, cause) {
  const index = replays.findIndex((r) => r.result.scenarioId === scenarioId);
  if (index < 0) return;
  $("run-select").value = index;
  replayIndex = cause
    ? replays[index].result.trace.findIndex((r) => r.id === cause)
    : -1;
  drawReplay();
  showTab("replay");
}
function replayMenu() {
  $("run-select").replaceChildren(
    ...replays.map((run, i) => {
      const option = node(
        "option",
        `${run.label ?? run.result.scenarioId}${run.hypothetical ? " · hypothetical" : ""}`,
      );
      option.value = i;
      return option;
    }),
  );
  $("run-select").disabled = !replays.length;
  replayIndex = -1;
  drawReplay();
}
function drawReplay() {
  const run = replays[Number($("run-select").value)]?.result;
  $("previous-event").disabled = !run || replayIndex <= -1;
  $("next-event").disabled = !run || replayIndex >= run.trace.length - 1;
  $("replay-position").disabled = !run;
  if (!run) {
    $("trace").replaceChildren(
      node("p", "Run preflight to create a saved replay.", "empty"),
    );
    $("entity-state").replaceChildren();
    $("replay-summary").textContent = "No experiment yet.";
    $("causal-chain").replaceChildren();
    return;
  }
  replayIndex = Math.max(-1, Math.min(replayIndex, run.trace.length - 1));
  replayView(
    run,
    replayIndex,
    replays[Number($("run-select").value)].sourceMap ?? workspace.sourceMap,
  );
}
function renderWorkspace() {
  $("project-panel").hidden = false;
  $("welcome").hidden = true;
  $("workspace-name").textContent = workspace.name;
  $("project-title").textContent = workspace.name;
  $("version").textContent = `PROJECT / VERSION ${workspace.version}`;
  overviewView(
    workspace,
    selectReplay,
    health?.automationConversationConfigured,
  );
  candidatesView(
    workspace,
    (id) =>
      work("Rechecking the candidate and preparing its review…", () =>
        prepareReview(id),
      ),
    (id) =>
      work("Replaying the same experiment before and after the guard…", () =>
        compareCandidate(id),
      ),
  );
  sourceView(workspace, workspace.graph);
  if (evidence) evidenceView(evidence, workspace.projectHash);
  replays = workspace.runs.map((r) => ({
    ...r,
    sourceMap: workspace.sourceMap,
  }));
  replayMenu();
  $("review-panel").hidden = true;
  review = null;
  $("confirm-export").checked = false;
  $("export").disabled = true;
  projectsView(projects, workspace.id, (id) =>
    work("Restoring your project…", () => loadProject(id)),
  );
  screenView();
}
async function loadProject(id) {
  const switchingProject = workspace?.id !== id;
  workspace = await api.call("get", { projectId: id });
  try {
    sessionStorage.setItem("automation-current", id);
  } catch {
    /* Session-only browser mode. */
  }
  $("import-panel").hidden = true;
  editing = false;
  $("conversation-detail").hidden = true;
  if (switchingProject) {
    currentTab = "overview";
    renderTab(currentTab);
  }
  renderWorkspace();
  notice(`Opened ${workspace.name}, version ${workspace.version}.`);
}
function openImport(update = false, preserveDraft = false) {
  if (!requireLogin()) return;
  review = null;
  $("review-panel").hidden = true;
  $("confirm-export").checked = false;
  $("export").disabled = true;
  editing = update;
  $("import-panel").hidden = false;
  screenView();
  const context = update ? `${workspace?.id}:${workspace?.version}` : "new";
  if (preserveDraft && importContext === context) return;
  importContext = context;
  $("confirm-import").checked = false;
  $("import-issues").hidden = true;
  $("import-submit").textContent = update
    ? "Save a new source version"
    : "Import and save project";
  if (update && workspace) {
    $("project-name").value = workspace.name;
    $("yaml").value = workspace.source;
    $("snapshot").value = JSON.stringify(
      {
        entities: workspace.project.entities,
        expectations: workspace.project.expectations,
        suite: workspace.suite,
      },
      null,
      2,
    );
  } else {
    $("project-name").value = "";
    $("yaml").value = "";
    $("snapshot").value = "";
  }
  $("import-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  $("project-name").focus();
  notice(
    update
      ? "Edit the source, then confirm and save a new version. Previous export approval has been cleared."
      : "Load the example or add your rules and expected behavior.",
  );
}
async function loadExample() {
  if (!requireLogin()) return;
  openImport(false);
  const example = await api.request("/automation/example");
  $("project-name").value = "Hallway · manual override";
  $("yaml").value = example.source;
  $("snapshot").value = JSON.stringify(example.snapshot, null, 2);
  notice(
    "Example loaded. Read the expectations and test outputs, then confirm and import it.",
  );
}
async function prepareReview(candidateId) {
  review = await api.call("review", {
    projectId: workspace.id,
    candidateId,
    expectedVersion: workspace.version,
  });
  reviewView(review);
  showTab("repair");
  notice(
    "The repair passed the current checks. Review both YAML versions, then explicitly approve its export.",
  );
}
async function compareCandidate(candidateId) {
  const scenarioId =
    workspace.analysis.baseline.results.find((r) => r.findings.length)
      ?.scenarioId ?? workspace.suite[0].scenario.id;
  const comparison = await api.call("compare", {
    projectId: workspace.id,
    candidateId,
    scenarioId,
  });
  if (comparison.version !== workspace.version)
    throw new Error(
      "The source changed in another session. Reload your project before comparing the repair.",
    );
  // After insertion, source action indices differ. Only original replay has original source lines.
  replays = [
    {
      result: comparison.before,
      label: `Before · ${scenarioId}`,
      sourceMap: workspace.sourceMap,
    },
    {
      result: comparison.after,
      label: `After · ${scenarioId}`,
      sourceMap: {},
      hypothetical: true,
    },
  ];
  replayMenu();
  showTab("replay");
  selectReplay(scenarioId, comparison.before.findings[0]?.cause);
  notice(
    `Before: ${comparison.before.status}. After: ${comparison.after.status}. Both use the same inputs; normal behavior also passed the declared suite.`,
  );
}

$("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  work("Opening your account…", async () => {
    const session = await api.request(
      `/automation/session/${event.submitter?.value ?? "login"}`,
      { username: $("username").value, password: $("password").value },
    );
    api.setSession(session);
    $("password").value = "";
    accountView();
    await refreshProjects();
    if (projects.length) await loadProject(projects[0].id);
    else {
      notice(
        "Account ready. Load the guided example or import your own rules.",
      );
      screenView();
    }
  });
});
$("sign-out").addEventListener("click", () => {
  if (busy) return;
  resetSession();
  $("yaml").value = "";
  $("snapshot").value = "";
  $("message").value = "";
  notice("Signed out. Your saved projects remain in your account.");
});
$("new-project").addEventListener("click", () => {
  if (!busy) openImport();
});
$("edit-project").addEventListener("click", () => {
  if (!busy) openImport(true);
});
for (const id of ["example", "welcome-example"])
  $(id).addEventListener("click", () =>
    work("Loading the guided experiment…", loadExample),
  );
$("cancel-import").addEventListener("click", closeImport);
$("navigate-home").addEventListener("click", goHome);
$("workshop-home").addEventListener("click", (event) => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  goHome();
});
$("workspace-name").addEventListener("click", () => {
  if (busy || !workspace) return;
  $("import-panel").hidden = true;
  showTab("overview");
  screenView();
  focusView();
});
$("navigate-back").addEventListener("click", () => {
  if (busy) return;
  if (navigationIndex) history.back();
  else if (!$("import-panel").hidden) closeImport();
  else if (currentTab !== "overview") {
    showTab("overview");
    focusView();
  }
  else goHome();
});
window.addEventListener("popstate", (event) => {
  if (event.state?.workshop) void restoreNavigation(event.state);
});
for (const id of ["project-name", "yaml", "snapshot"])
  $(id).addEventListener("input", () => {
    $("confirm-import").checked = false;
  });
for (const [inputId, targetId] of [
  ["yaml-file", "yaml"],
  ["snapshot-file", "snapshot"],
])
  $(inputId).addEventListener("change", (event) =>
    work("Reading your selected file…", async () => {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 128000)
        throw new Error("Choose a file smaller than 128 KB.");
      $(targetId).value = await file.text();
      $("confirm-import").checked = false;
      notice("File loaded locally. Review the content before importing.");
    }),
  );
$("import-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!requireLogin()) return;
  work("Validating the complete import…", async () => {
    let snapshot;
    try {
      snapshot = JSON.parse($("snapshot").value);
    } catch {
      throw new Error(
        "Snapshot JSON could not be parsed. Check its commas and quotes; nothing was saved.",
      );
    }
    if (
      !snapshot ||
      Array.isArray(snapshot) ||
      Object.keys(snapshot).some(
        (key) => !["entities", "expectations", "suite"].includes(key),
      )
    )
      throw new Error(
        "Snapshot JSON should contain only entities, expectations and suite. See the guided example.",
      );
    const result = await api.call("import", {
      name: $("project-name").value,
      source: $("yaml").value,
      entities: snapshot.entities,
      expectations: snapshot.expectations,
      suite: snapshot.suite,
      confirmed: $("confirm-import").checked,
      ...(editing && workspace
        ? { projectId: workspace.id, expectedVersion: workspace.version }
        : {}),
    });
    if (result.status !== "SUPPORTED") {
      $("import-issues").hidden = false;
      $("import-issues").replaceChildren(
        node("strong", "Unsupported import — no project was saved."),
        ...result.issues.map((i) =>
          node("p", `${i.ruleId ?? i.path}: ${i.message}`),
        ),
      );
      notice(
        "The import contains unsupported or invalid constructs. Review the issues below.",
        true,
      );
      return;
    }
    await refreshProjects();
    await loadProject(result.workspace.id);
    showTab("overview");
    notice(
      "Project saved. Run preflight or ask Rehearse to investigate the behavior.",
    );
  });
});
$("run").addEventListener("click", () =>
  work("Running regressions, timing search, and repair checks…", async () => {
    await api.call("preflight", { projectId: workspace.id });
    await loadProject(workspace.id);
    showTab("overview");
    notice(
      "Preflight complete. Inspect the findings, then compare the repair against the same inputs.",
    );
  }),
);
$("conversation-form").addEventListener("submit", (event) => {
  event.preventDefault();
  voice.stopListening();
  const message = $("message").value;
  work(
    "Interpreting your request and checking the declared model…",
    async () => {
      const response = await api.call("respond", {
        projectId: workspace.id,
        message,
      });
      await loadProject(workspace.id);
      $("message").value = "";
      showTab("overview");
      notice(response.summary);
      if (
        !["preflight", "repair", "inspect", "clarify"].includes(
          response.operation,
        )
      ) {
        const detail = $("conversation-detail");
        detail.hidden = false;
        detail.replaceChildren(
          node("h3", `Request evidence · ${response.operation}`),
          node("pre", JSON.stringify(response.result, null, 2)),
        );
        if (
          response.operation === "draft" &&
          response.result.validation === "SUPPORTED"
        ) {
          const b = node(
            "button",
            "Review draft in the source editor",
            "button secondary",
          );
          b.type = "button";
          b.addEventListener("click", () => {
            openImport(true);
            $("yaml").value = response.result.draftYaml;
            notice(
              "Draft loaded for review. Confirm its intent and import a new version to verify it.",
            );
          });
          detail.append(b);
        }
      }
    },
  );
});
$("confirm-export").addEventListener("change", () => {
  $("export").disabled = !review || !$("confirm-export").checked;
});
$("export").addEventListener("click", () =>
  work("Rechecking and releasing the reviewed export…", async () => {
    if (!review || !$("confirm-export").checked)
      throw new Error("Review and explicitly confirm this export first.");
    const result = await api.call("export", {
      projectId: workspace.id,
      approvalId: review.approvalId,
      expectedVersion: review.version,
      confirmed: true,
    });
    const url = URL.createObjectURL(
        new Blob([result.content], { type: "application/yaml" }),
      ),
      link = node("a", "");
    link.href = url;
    link.download = result.filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    review = null;
    $("confirm-export").checked = false;
    $("export").disabled = true;
    notice(
      "Approved YAML downloaded. Review your Home Assistant installation separately before manually using it.",
    );
  }),
);
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => b.addEventListener("click", () => {
    if (!busy) showTab(b.dataset.tab);
  }));
$("run-select").addEventListener("change", () => {
  replayIndex = -1;
  drawReplay();
});
$("replay-position").addEventListener("input", (event) => {
  replayIndex = Number(event.target.value);
  drawReplay();
});
$("previous-event").addEventListener("click", () => {
  replayIndex--;
  drawReplay();
});
$("next-event").addEventListener("click", () => {
  replayIndex++;
  drawReplay();
});
$("trace").addEventListener("click", (event) => {
  const row = event.target.closest("[data-index]");
  if (row) {
    replayIndex = Number(row.dataset.index);
    drawReplay();
  }
});
$("mic").addEventListener("click", () => {
  if (!busy) voice.start();
});
$("stop-voice").addEventListener("click", () => voice.cancel());
window.addEventListener("pagehide", () => voice.cancel());

await work("Opening the workshop…", async () => {
  health = await api.request("/health");
  accountView();
  $("connection").textContent =
    `${health.automationStorage === "prisma" ? "Neon storage" : "Temporary memory"} · Workshop uses MCP`;
  evidence = await api.request("/automation/evidence");
  if (api.token) {
    await refreshProjects();
    let id;
    try {
      id = sessionStorage.getItem("automation-current");
    } catch {
      /* Session-only browser mode. */
    }
    const requestedProject = initialParams.get("project");
    if (projects.length && initialParams.get("view") !== "home")
      await loadProject(
        projects.some((p) => p.id === requestedProject) ? requestedProject
          : projects.some((p) => p.id === id) ? id : projects[0].id,
      );
    else notice("Account ready. Import an experiment to begin.");
  } else
    notice(
      "Sign in to keep your experiments, then start with the guided example or your own rules.",
    );
});
if (workspace) showTab(initialParams.get("view"));
if (api.token && ["import", "edit"].includes(initialParams.get("view")))
  openImport(initialParams.get("view") === "edit" && Boolean(workspace));
navigationReady = true;
updateNavigation(true);
