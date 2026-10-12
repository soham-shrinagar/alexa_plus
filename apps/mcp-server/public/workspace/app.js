import { McpBrowserClient } from "../mcpClient.js";
import { scenarioFromControls, describeChange } from "./decisionModel.js";
import { confirmAction } from "../approvalDialog.js";
import {
  state,
  readPreference,
  writePreference,
  rememberPlan,
  proposalHistory,
} from "./state.js";
import {
  $,
  element,
  decorateIcons,
  setNotice,
  appendMessage,
  addTrace,
} from "./dom.js";
import {
  showPage,
  renderPlan,
  renderComparison,
  renderSaved,
  renderAudit,
  renderConnections,
} from "./views.js";
import {
  addPerson,
  addDevice,
  loadProfile,
  collectProfile,
} from "./household.js";

const client = new McpBrowserClient({ onActivity: addTrace });
decorateIcons();
const emptyBoard = $("#plan-board").innerHTML;
const emptyComparison = $("#comparison-board").innerHTML;
const fixtureGoal =
  "Make our school mornings run themselves. Leave by 7:45, don't wake the baby before 7, don't run the kettle and water heater together, and leave 15 minutes earlier when it rains.";
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
$("#date").value =
  `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
$("#timezone").value = Intl.DateTimeFormat().resolvedOptions().timeZone;
$("#today").textContent = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "short",
  day: "numeric",
}).format(new Date());
restoreContext();
showPage(new URLSearchParams(location.search).get("view") ?? "plan");
document
  .querySelectorAll("[data-view]")
  .forEach((button) =>
    button.addEventListener("click", () => navigate(button.dataset.view)),
  );
bind("plan", plan);
bind("search-origin", () => searchPlace("origin"));
bind("search-destination", () => searchPlace("destination"));
bind("sample-places", () => {
  selectPlace("origin", {
    label: "Public demo: Railway Station Road, Pune",
    latitude: 18.5221,
    longitude: 73.8658,
  });
  selectPlace("destination", {
    label: "Public demo: Baner Road, Pune",
    latitude: 18.5564,
    longitude: 73.7957,
  });
  $("#journey-details").open = true;
  $("#request").value =
    "Reach the selected destination by 10am on the selected date. Check weather and traffic, allow 20 minutes to get ready plus 10 minutes to pack my laptop, and plan a reminder before preparation.";
  saveContext();
  setNotice(
    "Public example locations selected. The route and forecast will be fetched live; these are not your home or office.",
  );
});
bind("new-plan", () => {
  if (state.activation)
    throw new Error(
      "Stop the current simulation before starting another plan.",
    );
  state.proposal = null;
  state.evidenceAssessment = null;
  state.simulation = null;
  state.activation = null;
  state.comparison = null;
  state.history = [];
  $("#comparison-board").innerHTML = emptyComparison;
  $("#plan-evidence").replaceChildren();
  $("#evidence-panel").open = false;
  $("#audit-list").replaceChildren(
    element("p", "Choose a saved plan to inspect its history.", "help"),
  );
  rememberPlan(null);
  $("#conversation").replaceChildren();
  $("#request").value = "";
  $("#plan-board").innerHTML = emptyBoard;
  $("#plan-status").textContent = "No plan yet";
  controls();
  showPage("plan");
  setNotice("Ready for a new outcome. Saved plans remain in your workspace.");
});
for (const field of ["origin", "destination"])
  $("#" + field).addEventListener("input", () => {
    delete state.places[field];
    $("#" + field + "-selected").textContent =
      "Search and select the changed location";
    $("#" + field + "-selected").classList.remove("selected");
    $("#" + field + "-results").replaceChildren();
    saveContext();
  });
document
  .querySelectorAll(".intent-panel input,.intent-panel select")
  .forEach((input) => input.addEventListener("change", saveContext));
const examples = {
  commute:
    "Reach my selected destination by 10am on the selected date. Check traffic and weather. Allow 20 minutes to get ready and 10 minutes to pack a bag.",
  evening:
    "Read for 30 minutes starting at 18:00, then pack a bag for 20 minutes. Finish both by 19:00. Keep all declared household policies.",
  forecast:
    "What will the forecast temperature and precipitation be at my starting point at 10am on the selected date?",
};
document.querySelectorAll("[data-example]").forEach((button) =>
  button.addEventListener("click", () => {
    $("#request").value = examples[button.dataset.example];
    $("#request").focus();
  }),
);
bind("open-rehearsal", () => {
  showPage("rehearse");
  $("#stress-runtime").checked = Boolean(state.activation);
  if (state.activation) $("#stress-delay").value = 0;
  updateStressLabel();
  return compare();
});
bind("compare", compare);
$("#stress-delay").addEventListener("input", updateStressLabel);
for(const id of ["stress-delay","stress-rain","stress-capability","stress-task","stress-task-minutes","stress-runtime","failure-capabilities"])$("#"+id).addEventListener("change",()=>{
  if(!state.comparison)return;
  state.comparison=null;$("#comparison-board").innerHTML=emptyComparison;
  setNotice("Conditions changed. Compare again before selecting an alternative.");
});
document.querySelectorAll("[data-delay]").forEach((button) =>
  button.addEventListener("click", () =>
    run(async () => {
      $("#stress-delay").value = button.dataset.delay;
      $("#stress-rain").checked = false;
      $("#stress-capability").value = "";
      resetExtraConditions();
      updateStressLabel();
      await compare();
    }),
  ),
);
bind("rain-test", () => {
  resetExtraConditions();
  $("#stress-capability").value = "";
  $("#stress-delay").value = 0;
  $("#stress-rain").checked = true;
  updateStressLabel();
  return compare();
});
bind("approve", approve);
bind("repair", async () => {
  requirePlan();
  const result = await client.callTool("routine.repair", {
    proposalId: state.proposal.id,
  });
  await adopt(result);
  appendMessage(
    "assistant",
    result.suggestions?.map((item) => item.message).join("\n") ||
      "The repaired schedule passes verification.",
  );
  setNotice(
    result.simulation.status === "PASSED"
      ? "Timing repaired. Review the verified version."
      : "Some conflicts require your explicit instruction.",
  );
});
bind("revise", async () => {
  requirePlan();
  const input = {
    proposalId: state.proposal.id,
    instruction: $("#revision").value.trim(),
    mode: "auto",
  };
  const result = await client.callTool("routine.revise", input);
  if (result.needsClarification) {
    appendMessage("assistant", result.questions.join("\n"));
    return;
  }
  await adopt(result);
  setNotice(
    result.simulation.status === "PASSED"
      ? "The explicit change passes verification."
      : "The changed version still has conflicts.",
  );
});
bind("refresh", async () => {
  requirePlan();
  if (state.activation)
    throw new Error("Stop the simulation before refreshing this plan.");
  if (state.proposal.routine.replacement)
    throw new Error(
      "This is a recovery proposal bound to a paused runtime. Stop that runtime and build a fresh plan if its evidence has expired.",
    );
  const result = state.proposal.routine.journey
    ? await client.callTool(
        "journey.plan",
        state.proposal.routine.journey.input,
      )
    : await client.callTool("routine.refresh_environment", {
        proposalId: state.proposal.id,
      });
  await adopt(result);
  setNotice(
    "Current evidence fetched and verified. Existing calendar imports must be replaced manually if timing changed.",
  );
});
bind("export", exportCalendar);
bind("inject-delay", () => runtimeEvent({ type: "TRAVEL_DELAY", minutes: 15 }));
bind("recover-baseline", async () => {
  if (!state.activation) throw new Error("Start a simulation first.");
  const original = state.activation.runtimeState.approvedRoutine.context;
  await runtimeEvent({
    type: "TRAVEL_DELAY",
    minutes: original.travelDelayMinutes ?? 0,
  });
  await runtimeEvent({
    type: "WEATHER_CHANGED",
    raining: original.weather?.raining ?? false,
  });
  for (const capability of state.activation.runtimeState.context
    .unavailableCapabilities ?? [])
    if (!(original.unavailableCapabilities ?? []).includes(capability))
      await runtimeEvent({ type: "DEVICE_RECOVERED", capability });
});
bind("recover-plan", () => {
  showPage("rehearse");
  $("#stress-runtime").checked = true;
  $("#stress-delay").value = 0;
  $("#stress-rain").checked =
    state.activation?.runtimeState.context.weather?.raining === true;
  $("#stress-capability").value = "";
  updateStressLabel();
  return compare();
});
bind("stop", async () => {
  if (!state.activation) throw new Error("No active simulation.");
  if (
    !(await review(
      "Stop this simulation?",
      "Restore its captured virtual snapshot. Imported calendar files are separate and are not deleted.",
      "Stop simulation",
    ))
  )
    return;
  await client.callTool("routine.rollback", {
    activationId: state.activation.id,
    confirmed: true,
  });
  await loadPlan(state.proposal.id, false);
  await listPlans();
  setNotice("Simulation stopped. The captured virtual snapshot was restored.");
});
bind("reload-plans", listPlans);
bind("load-audit", loadAudit);
bind("benchmark", async () => {
  if (state.activation) throw new Error("Stop the current simulation first.");
  const result = await client.callTool("routine.compile", {
    goal: fixtureGoal,
    mode: "fixture",
    scenarioId: "school-morning",
    dataMode: "fixture",
  });
  const verified = await client.callTool("simulation.run", {
    proposalId: result.proposal.id,
  });
  await adopt({ ...result, ...verified });
  $("#revision").value =
    "On Fridays, Maya can wake at 6:50, but keep everything else unchanged.";
  showPage("plan");
  setNotice(
    "Offline household benchmark loaded. Its conflicts and environment are synthetic; the verifier is real.",
  );
});
bind("copy-profile", () => {
  const profile = state.profiles.find(
    (item) => item.id === $("#edit-profile").value,
  );
  if (profile)
    loadProfile(
      profile,
      [
        "personal-day",
        "school-morning",
        "work-morning",
        "evening-guests",
      ].includes(profile.id),
    );
});
bind("add-person", () => addPerson());
bind("add-device", () => addDevice());
bind("profile-to-json", () => {
  $("#household-json").value = JSON.stringify(collectProfile(), null, 2);
});
bind("json-to-profile", () =>
  loadProfile(JSON.parse($("#household-json").value)),
);
bind("save-household", async () => {
  const profile = collectProfile();
  if (
    !(await review(
      "Save these household rules?",
      `${profile.name}: ${profile.people.length} people, ${profile.devices.length} simulated devices. Maximum simultaneous power: ${profile.policies.maxConcurrentPowerWatts} W. Review earliest-start and quiet-hour settings before saving.`,
      "Save household",
    ))
  )
    return;
  const saved = await client.callTool("household.configure", {
    profile,
    confirmed: true,
  });
  loadProfile(saved.profile);
  await profiles();
  $("#profile").value = profile.id;
  saveContext();
  setNotice(
    "Household saved. New plans use these rules; existing plans retain their snapshots.",
  );
});
connect().catch((error) => setNotice(error.message, true));

function bind(id, action) {
  $("#" + id).addEventListener("click", () => run(action));
}
async function run(action) {
  if (state.busy || !state.connected) return;
  state.busy = true;
  controls();
  try {
    await action();
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    state.busy = false;
    controls();
  }
}
function requirePlan() {
  if (!state.proposal) throw new Error("Build or open a saved plan first.");
}
function controls() {
  document
    .querySelectorAll("[data-work]")
    .forEach(
      (button) =>
        (button.disabled =
          !state.connected || state.busy || button.dataset.blocked === "true"),
    );
  const p = state.proposal;
  const active = Boolean(state.activation);
  const passed =
    state.simulation?.status === "PASSED" || p?.status === "VERIFIED";
  $("#plan-actions").hidden = !p;
  $("#runtime-panel").hidden = !active;
  $("#revision-panel").hidden = !p || Boolean(p.routine.journey) || active;
  $("#approve").hidden = !p || active || p.status === "ROLLED_BACK";
  $("#approve").disabled = !passed || state.busy;
  if(state.evidenceAssessment?.approvalEvidenceSatisfied===false)$("#approve").disabled=true;
  $("#export").hidden = !p?.routine.journey;
  $("#export").disabled =
    state.busy ||
    !p ||
    !["VERIFIED", "AWAITING_APPROVAL", "ACTIVE"].includes(p.status);
  $("#refresh").hidden =
    !p || (!p.routine.journey && p.context.dataMode !== "live");
  $("#refresh").disabled = state.busy || active;
  $("#repair").hidden =
    !p || p.routine.journey || active || !state.simulation?.violations?.length;
  $("#recover-plan").disabled = state.busy || !active;
  $("#stress-runtime").disabled = !active;
  $("#plan").textContent = state.busy ? "Working…" : "Build my plan";
  $("#load-audit").disabled = state.busy || !p;
  const hasDeparture = Boolean(
    p?.routine.constraints.some((rule) => rule.type === "DEADLINE"),
  );
  $("#view-rehearse").querySelectorAll("input,select").forEach(input=>input.disabled=!state.connected||state.busy);
  $("#stress-runtime").disabled=!active||state.busy;
  $("#stress-delay").disabled = state.busy || !hasDeparture;
  document.querySelectorAll("[data-delay]").forEach((button) => {
    if (Number(button.dataset.delay) > 0 && !hasDeparture)
      button.disabled = true;
  });
}
async function connect() {
  state.busy = true;
  controls();
  try {
    await client.connect();
    state.tools = await client.listTools();
    state.health = await fetch("/health").then((response) => response.json());
    await profiles();
    state.connected = true;
    $("#connection").textContent = "MCP connected";
    $("#connection-dot").classList.add("live");
    renderConnections();
    controls();
    await listPlans();
    const selected = readPreference("selected-plan");
    if (selected && state.plans.some((item) => item.id === selected))
      await loadPlan(selected, false);
    setNotice(
      state.proposal
        ? "Selected plan restored. Inspect it or rehearse a change."
        : "Ready. Describe an outcome, or use public locations to try a live journey.",
    );
  } finally {
    state.busy = false;
    controls();
  }
}
async function profiles() {
  state.profiles = (await client.callTool("household.list_profiles")).profiles;
  const selected = readPreference("context", {}).profile ?? $("#profile").value;
  for (const id of ["profile", "edit-profile"]) {
    $("#" + id).replaceChildren(
      ...state.profiles.map((profile) => {
        const option = element("option", profile.name);
        option.value = profile.id;
        return option;
      }),
    );
  }
  if (state.profiles.some((profile) => profile.id === selected))
    $("#profile").value = selected;
  else $("#profile").value = "personal-day";
  if (!$("#people-editor").children.length)
    loadProfile(
      state.profiles.find((profile) => profile.id === "personal-day"),
      true,
    );
}
function context() {
  const input = {
    ...state.places,
    date: $("#date").value,
    timezone: $("#timezone").value,
    travelMode: $("#mode").value,
    preparationMinutes: Number($("#prep").value),
    safetyBufferMinutes: Number($("#safety").value),
    rainBufferMinutes: Number($("#rain").value),
    reminderLeadMinutes: Number($("#lead").value),
  };
  if ($("#arrival").value) input.arrivalTime = $("#arrival").value;
  return input;
}
function saveContext() {
  writePreference("context", { ...context(), profile: $("#profile").value });
}
function restoreContext() {
  const saved = readPreference("context");
  if (!saved) return;
  for (const [field, value] of Object.entries({
    date: saved.date,
    timezone: saved.timezone,
    mode: saved.travelMode,
    arrival: saved.arrivalTime,
    prep: saved.preparationMinutes,
    safety: saved.safetyBufferMinutes,
    rain: saved.rainBufferMinutes,
    lead: saved.reminderLeadMinutes,
  }))
    if (value !== undefined) $("#" + field).value = value;
  for (const field of ["origin", "destination"])
    if (saved[field]) selectPlace(field, saved[field]);
}
async function plan() {
  const message = $("#request").value.trim();
  if (message.length < 3) throw new Error("Describe the outcome first.");
  if (state.activation)
    throw new Error(
      "Stop or recover the active simulation before starting another plan.",
    );
  for (const input of $("#view-plan").querySelectorAll(".intent-panel input"))
    if (!input.checkValidity()) throw new Error(input.validationMessage);
  saveContext();
  appendMessage("user", message);
  setNotice(
    "Interpreting tasks, choosing relevant tools and checking the schedule…",
  );
  const result = await client.callTool("planner.respond", {
    message,
    history: state.history.slice(-8),
    scenarioId: $("#profile").value,
    context: context(),
  });
  state.history.push({ role: "user", text: message });
  const reply = [result.reply, ...(result.questions ?? [])]
    .filter(Boolean)
    .join("\n");
  state.history.push({ role: "assistant", text: reply.slice(0, 2000) });
  appendMessage("assistant", reply);
  for (const step of result.trace ?? [])
    addTrace("Workflow", `${step.tool}: ${step.purpose ?? step.status}`);
  for (const [field, results] of Object.entries(result.locations ?? {})) {
    showPlaces(field, results);
    $("#journey-details").open = true;
  }
  if (result.proposal) await adopt(result);
  else if (result.evidence && !state.proposal) {
    $("#plan-evidence").replaceChildren(element("p", reply, "evidence-item"));
    $("#evidence-panel").open = true;
  }
  setNotice(
    result.needsClarification
      ? "More context is needed. Select the places or answer the question, then build again."
      : result.proposal
        ? result.simulation?.status === "PASSED"
          ? "Plan verified. Rehearse a disruption before reviewing approval."
          : "Conflicts found. Inspect the requirements and compare a repair."
        : "Provider result ready.",
  );
}
async function adopt(result) {
  state.proposal = result.proposal;
  state.evidenceAssessment=result.evidenceAssessment??null;
  state.simulation = result.simulation ?? null;
  state.activation = result.activation ?? null;
  state.comparison = null;
  $("#comparison-board").innerHTML = emptyComparison;
  state.history = proposalHistory(state.proposal);
  if (result.message)
    appendMessage(
      "assistant",
      result.message +
        " " +
        (state.proposal.routine.lineage?.changeSummary ?? ""),
    );
  rememberPlan(state.proposal);
  syncPlanForm();
  renderPlan();
  populateCapabilities();
  controls();
  await listPlans();
}
async function loadPlan(id, navigateToPlan = true) {
  const result = await client.callTool("routine.get_status", {
    proposalId: id,
  });
  state.proposal = result.proposal;
  state.evidenceAssessment=result.evidenceAssessment??null;
  state.simulation = result.simulation;
  state.activation = result.activation;
  state.comparison = null;
  $("#comparison-board").innerHTML = emptyComparison;
  state.history = proposalHistory(state.proposal);
  rememberPlan(state.proposal);
  syncPlanForm();
  renderPlan();
  populateCapabilities();
  controls();
  if (navigateToPlan) showPage("plan");
}
function syncPlanForm() {
  $("#request").value = state.proposal.goal;
  if (
    state.profiles.some((profile) => profile.id === state.proposal.scenarioId)
  )
    $("#profile").value = state.proposal.scenarioId;
  if (state.proposal.routine.journey) {
    const input = state.proposal.routine.journey.input;
    for (const field of ["origin", "destination"])
      selectPlace(field, input[field]);
    for (const [field, value] of Object.entries({
      date: input.date,
      timezone: input.timezone,
      arrival: input.arrivalTime,
      mode: input.travelMode,
      prep: input.preparationMinutes,
      safety: input.safetyBufferMinutes,
      rain: input.rainBufferMinutes,
      lead: input.reminderLeadMinutes,
    }))
      if (value !== undefined) $("#" + field).value = value;
  }
  saveContext();
}
async function searchPlace(field) {
  const query = $("#" + field).value.trim();
  if (query.length < 3) throw new Error("Include a street or area and city.");
  setNotice(`Looking up ${field}…`);
  showPlaces(field, await client.callTool("place.search", { query }));
  $("#journey-details").open = true;
  setNotice(
    "Select the intended location; names can match more than one place.",
  );
}
function showPlaces(field, result) {
  const target = $("#" + field + "-results");
  target.replaceChildren();
  for (const place of result.places) {
    const button = element("button", place.label);
    button.addEventListener("click", () => selectPlace(field, place));
    target.append(button);
  }
  if (!result.places.length)
    target.append(
      element("p", "No match. Try a more specific street and city.", "help"),
    );
}
function selectPlace(field, place) {
  state.places[field] = place;
  $("#" + field).value = place.label;
  $("#" + field + "-selected").textContent =
    `Selected · ${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`;
  $("#" + field + "-selected").classList.add("selected");
  $("#" + field + "-results").replaceChildren();
  $("#places-summary").textContent =
    state.places.origin && state.places.destination
      ? "Both locations selected"
      : "Location selected";
  saveContext();
}
function populateCapabilities() {
  const selected = $("#stress-capability").value;
  const options = [element("option", "None")];
  options[0].value = "";
  for (const capability of [
    ...new Set(
      state.proposal?.routine.steps.map((step) => step.capability) ?? [],
    ),
  ]) {
    const option = element("option", capability.replaceAll("_", " "));
    option.value = capability;
    options.push(option);
  }
  $("#stress-capability").replaceChildren(...options);
  if (options.some((option) => option.value === selected))
    $("#stress-capability").value = selected;
  $("#failure-capabilities").replaceChildren();
  for (const option of options.filter((option) => option.value)) {
    const label = element("label", null, "checkbox");
    const input = element("input");
    input.type = "checkbox";
    input.value = option.value;
    label.append(input, document.createTextNode(option.textContent));
    $("#failure-capabilities").append(label);
  }
  const tasks = [element("option", "No task allowance")];
  tasks[0].value = "";
  for (const step of state.proposal?.routine.steps.filter(
    (step) =>
      !step.departure &&
      ["manual_task", "prepare_person"].includes(step.capability),
  ) ?? []) {
    const option = element(
      "option",
      `${step.label} · ${step.durationMinutes} min`,
    );
    option.value = step.id;
    tasks.push(option);
  }
  $("#stress-task").replaceChildren(...tasks);
  if (
    !state.proposal?.routine.constraints.some(
      (rule) => rule.type === "DEADLINE",
    )
  ) {
    $("#stress-delay").value = 0;
    updateStressLabel();
  }
}
function updateStressLabel() {
  $("#stress-value").textContent = `${$("#stress-delay").value} minutes`;
}
function resetExtraConditions() {
  $("#stress-task").value = "";
  $("#failure-capabilities")
    .querySelectorAll("input")
    .forEach((input) => (input.checked = false));
}
async function compare() {
  requirePlan();
  const useRuntime = $("#stress-runtime").checked;
  if ($("#stress-task").value && !$("#stress-task-minutes").checkValidity())
    throw new Error("Choose a whole task allowance between 1 and 60 minutes.");
  const scenario = scenarioFromControls({
    extraTravelMinutes: Number($("#stress-delay").value),
    raining: $("#stress-rain").checked,
    capabilities: [
      $("#stress-capability").value,
      ...[...$("#failure-capabilities").querySelectorAll("input:checked")].map(
        (input) => input.value,
      ),
    ],
    stepId: $("#stress-task").value,
    taskMinutes: Number($("#stress-task-minutes").value),
  });
  setNotice(
    "Comparing the unchanged schedule and policy-preserving alternatives…",
  );
  state.comparison = await client.callTool("rehearsal.compare", {
    proposalId: state.proposal.id,
    scenario,
    useRuntime,
  });
  renderComparison((option) => run(() => chooseAlternative(option)));
  setNotice(
    "Rehearsal complete. Choose a feasible alternative or adjust the scenario; the original plan remains unchanged.",
  );
}
async function chooseAlternative(option) {
  const source = state.comparison;
  if (!source || !option.feasible) return;
  if (
    !(await review(
      "Accept this alternative?",
      `${option.title}\n${option.tradeoff}\n${option.changes.map(describeChange).join("\n")}\nVerification: ${option.verification?.status ?? "unmodeled"}.\nA separate verified proposal will be saved. ${source.sourceMode === "runtime" ? "The source runtime stays unchanged until you approve its replacement." : "Execution does not start yet."}`,
      "Save alternative",
    ))
  )
    return;
  const result = await client.callTool("rehearsal.adopt", {
    proposalId: source.proposalId,
    expectedVersion: source.sourceVersion,
    scenario: source.scenario,
    choice: option.id,
    useRuntime: source.sourceMode === "runtime",
    ...(source.sourceRuntimeHash
      ? { sourceRuntimeHash: source.sourceRuntimeHash }
      : {}),
    confirmed: true,
  });
  await adopt(result);
  showPage("plan");
  setNotice(result.message);
}
async function approve() {
  requirePlan();
  const request = await client.callTool("routine.request_activation", {
    proposalId: state.proposal.id,
  });
  state.proposal.status = "AWAITING_APPROVAL";
  state.evidenceAssessment=request.evidenceAssessment??state.evidenceAssessment;
  renderPlan();
  const text = `${state.proposal.routine.title}\n${state.proposal.routine.lineage?.changeSummary ?? state.proposal.routine.explanation ?? state.proposal.goal}\nVersion ${request.proposalVersion} · ${request.impact.steps} steps. Verification: ${request.verificationStatus??"PASSED"}. Evidence: ${request.evidenceAssessment?.freshnessStatus??"not assessed"} / ${request.evidenceAssessment?.completenessStatus??"not assessed"}.\n${request.evidenceAssessment?.warnings.map(warning=>warning.message).join("\n")??""}\nApproval expires at ${new Date(request.approval.expiresAt).toLocaleTimeString()}.\n${request.impact.replacingRuntime ? "The paused source runtime will be stopped and this recovery plan will replace it atomically." : "This starts the reviewed version in the simulated runtime."}`;
  if (
    !(await review("Start this verified simulation?", text, "Start simulation"))
  ) {
    setNotice("Approval cancelled. The proposal remains inert.");
    return;
  }
  const result = await client.callTool("routine.activate", {
    proposalId: state.proposal.id,
    approvalId: request.approval.id,
    confirmed: true,
    idempotencyKey: crypto.randomUUID(),
  });
  state.activation = result.activation;
  state.evidenceAssessment=result.evidenceAssessment??state.evidenceAssessment;
  state.proposal.status = "ACTIVE";
  renderPlan();
  controls();
  await listPlans();
  setNotice(
    request.impact.replacingRuntime
      ? "Recovery approved: the previous runtime was replaced and the new one is active."
      : "Verified version active in the simulated runtime.",
  );
}
async function runtimeEvent(event) {
  if (!state.activation) throw new Error("Start a simulation first.");
  const result = await client.callTool("routine.inject_event", {
    activationId: state.activation.id,
    event,
  });
  state.activation = result.activation;
  state.evidenceAssessment=result.evidenceAssessment??state.evidenceAssessment;
  state.proposal.status = result.activation.status;
  state.simulation = result.simulation;
  state.comparison = null;
  renderPlan();
  controls();
  await listPlans();
  setNotice(
    result.activation.status === "SUSPENDED"
      ? "The runtime paused because the adaptation has conflicts. Compare recovery alternatives."
      : "Current runtime conditions pass verification.",
  );
}
async function exportCalendar() {
  requirePlan();
  const result = await client.callTool("reminder.export", {
    proposalId: state.proposal.id,
  });
  const url = URL.createObjectURL(
    new Blob([result.content], { type: result.mimeType }),
  );
  const link = element("a");
  link.href = url;
  link.download = result.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setNotice(result.message);
}
async function listPlans() {
  state.plans = (await client.callTool("routine.list")).plans;
  renderSaved((id) => run(() => loadPlan(id)));
}
async function loadAudit() {
  requirePlan();
  renderAudit(
    (
      await client.callTool("audit.get_trace", {
        proposalId: state.proposal.id,
      })
    ).events,
  );
}
function review(title, message, confirmLabel = "Confirm") {
  return confirmAction($("#review-dialog"), $("#review-copy"), {
    title,
    message,
    confirmLabel,
  });
}
async function navigate(view) {
  showPage(view);
  if (!state.connected || state.busy) return;
  if (view === "rehearse" && state.activation) {
    $("#stress-runtime").checked = true;
    $("#stress-delay").value = 0;
    updateStressLabel();
  }
  if (view === "saved")
    await run(async () => {
      await listPlans();
      if (state.proposal) await loadAudit();
    });
  if (view === "connections") renderConnections();
}
