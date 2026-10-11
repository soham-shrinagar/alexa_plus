import { McpBrowserClient } from "./mcpClient.js";
import { confirmActivation, confirmAction } from "./approvalDialog.js";

const $ = (selector) => document.querySelector(selector);
const state = { client: null, tools: [], households: [], proposal: null, simulation: null, approval: null, activation: null, running: false, busy: false, connected: false, lastEvent: null, enabled: new Set() };
const actionOrder = ["compile", "simulate", "repair", "revise", "approve", "disrupt", "recover", "rollback"];
const fixtureGoal = "Make our school mornings run themselves. We need to leave by 7:45. Don’t wake the baby before 7, don’t run the kettle and water heater together, and leave 15 minutes earlier when it rains.";

const client = new McpBrowserClient({ onActivity: (method, detail) => addTrace(method, detail) });
state.client = client;

$("#guided").addEventListener("click", () => guidedDemo().catch(showError));
$("#reset").addEventListener("click", () => location.reload());
$("#ask").addEventListener("click", () => exclusive(askAssistant).catch(showError));
$("#household").addEventListener("change", selectHousehold);
$("#planner").addEventListener("change", refreshButtons);
$("#save-household").addEventListener("click", () => exclusive(saveHousehold).catch(showError));
$("#export-household").addEventListener("click", exportHousehold);
$("#refresh-environment").addEventListener("click", () => exclusive(refreshEnvironment).catch(showError));
document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => runAction(button.dataset.action).catch(() => {})));

connect().catch(showError);

async function connect() {
  setStatus("Opening a secured Streamable HTTP session…");
  await client.connect(); state.tools = await client.listTools();
  state.households = (await client.callTool("household.list_profiles")).profiles;
  renderHouseholdOptions(); selectHousehold(false);
  const health = await fetch("/health").then(response => response.json());
  $("#provider-status").textContent = `${health.plannerConfigured ? `Gemini configured (${health.geminiModel})` : "Gemini key missing — configure .env or choose the labelled fixture"}. Open-Meteo: keyless. TomTom: ${health.trafficConfigured ? "configured" : "optional key missing"}.`;
  state.connected = true;
  $("#connection-dot").classList.add("live"); $("#connection-label").textContent = "Browser ↔ MCP live";
  enable("compile"); refreshButtons(); setStatus(`${state.tools.length} MCP tools discovered. Ready to compile.`);
}

async function guidedDemo() {
  if (state.running || state.busy || !state.connected) return;
  state.running = true; refreshButtons();
  $("#planner").value = "fixture"; $("#household").value = "school-morning"; $("#data-mode").value = "fixture";
  $("#include-traffic").checked = false; $("#goal").value = fixtureGoal;
  $("#revision").value = "On Fridays, Maya can wake at 6:50, but keep everything else unchanged.";
  try { for (const action of actionOrder) { if (await runAction(action) === false) break; await pause(action === "approve" ? 300 : 650); } }
  finally { state.running = false; refreshButtons(); }
}

async function runAction(action) {
  const handlers = { compile, simulate, repair, revise, approve, disrupt, recover, rollback };
  if (state.busy) return false;
  state.busy = true; refreshButtons();
  try { setStatus(statusText[action]); const completed = await handlers[action](); if (completed !== false) markDone(action); return completed; }
  catch (error) { showError(error); throw error; }
  finally { state.busy = false; refreshButtons(); }
}

async function compile() {
  const result = await client.callTool("routine.compile", { goal: $("#goal").value, mode: $("#planner").value, ...planningOptions() });
  if (result.needsClarification) { assistantMessage("Rehearse", [result.explanation, ...result.questions].join(" ")); setStatus("Answer the clarification in your request, then plan again. No proposal was created."); return false; }
  adoptCompiled(result);
}

function adoptCompiled(result) {
  state.proposal = result.proposal; state.simulation = null; state.approval = null; state.activation = null;
  state.lastEvent = null;
  state.enabled = new Set(["compile"]); document.querySelectorAll("[data-action]").forEach((button) => button.classList.remove("done")); render(); enable("simulate");
  $("#planner-label").textContent = result.planner === "gemini" ? "Real Gemini plan" : "Deterministic fixture";
  assistantMessage("Rehearse", result.explanation);
  if (state.proposal.routine.extractedTasks) assistantMessage("Extracted tasks", state.proposal.routine.extractedTasks.map(task => task.request).join(" · "));
  if (state.proposal.routine.recommendedTools) assistantMessage("Catalog tool recommendations", state.proposal.routine.recommendedTools.join(", "));
  setStatus("Candidate saved, not yet verified. Simulate before requesting approval.");
}

async function simulate() {
  const result = await client.callTool("simulation.run", { proposalId: state.proposal.id });
  state.simulation = result.simulation; state.proposal.status = result.safeToActivate ? "VERIFIED" : "NEEDS_REPAIR"; render(); enable(result.safeToActivate ? "approve" : "repair");
  setStatus(`${result.simulation.violations.length} conflicts exposed before any action ran.`);
}

async function repair() {
  const result = await client.callTool("routine.repair", { proposalId: state.proposal.id });
  state.proposal = result.proposal; state.simulation = result.simulation; state.approval = null;
  if (result.simulation.status !== "PASSED") state.enabled.delete("approve");
  render(); enable(result.simulation.status === "PASSED" ? "approve" : "revise");
  if (result.changes.length) assistantMessage("Timing repairs", result.changes.map(change => `${change.stepId}: ${change.from} → ${change.to}. ${change.reason}`).join(" "));
  setStatus(result.suggestions[0]?.message ?? (result.simulation.status === "PASSED" ? "All constraints pass after repair." : "Some conflicts require a different goal or a supported revision."));
}

async function revise() {
  const result = await client.callTool("routine.revise", { proposalId: state.proposal.id, instruction: $("#revision").value, mode: state.proposal.routine.compiler === "gemini-validated-plan-v1" ? "gemini" : "fixture" });
  if (result.needsClarification) { assistantMessage("Rehearse", result.questions.join(" ")); setStatus("Revision needs clarification; the current version was not changed."); return false; }
  state.proposal = result.proposal; state.simulation = result.simulation; state.approval = null; render();
  if (result.simulation.status === "PASSED") enable("approve"); else state.enabled.delete("approve");
  assistantMessage("Explicit revision", result.explanation ?? JSON.stringify(result.changes));
  setStatus(result.simulation.status === "PASSED" ? "Explicit exception applied. The revised version passes every constraint." : "The revision still has conflicts. Adjust the start time and rehearse again.");
  if (result.simulation.status !== "PASSED") return false;
}

async function approve(existingRequest) {
  const request = existingRequest ?? await client.callTool("routine.request_activation", { proposalId: state.proposal.id }); state.approval = request.approval;
  state.proposal.status = "AWAITING_APPROVAL"; render();
  const confirmed = await confirmActivation($("#approval-dialog"), $("#approval-copy"), request);
  if (!confirmed) { setStatus("Activation cancelled; the verified proposal remains inert."); return false; }
  const result = await client.callTool("routine.activate", { proposalId: state.proposal.id, approvalId: request.approval.id, confirmed: true, idempotencyKey: `web-${state.proposal.id}-v${state.proposal.version}` });
  state.activation = result.activation; state.proposal.status = "ACTIVE"; state.enabled = new Set(["disrupt", "recover", "rollback"]); render();
  setStatus("Exact verified version activated in the simulated runtime; rollback snapshot captured.");
}

async function disrupt() {
  let event;
  const previousContext = structuredClone(state.activation.runtimeState.context);
  if (state.running) {
    await client.callTool("routine.inject_event", { activationId: state.activation.id, event: { type: "DEVICE_UNAVAILABLE", capability: "make_coffee" } });
    await client.callTool("routine.inject_event", { activationId: state.activation.id, event: { type: "TRAVEL_DELAY", minutes: 5 } });
    event = { type: "DEVICE_UNAVAILABLE", capability: "heat_water" };
  } else {
    const type = $("#event-type").value;
    event = type === "DEVICE_UNAVAILABLE" ? { type, capability: $("#event-capability").value } : type === "TRAVEL_DELAY" ? { type, minutes: Number($("#event-delay").value) } : { type, raining: true };
  }
  const result = await client.callTool("routine.inject_event", { activationId: state.activation.id, event });
  state.lastEvent = { ...event, previousContext };
  adoptRuntime(result);
  setStatus(result.simulation.status === "PASSED" ? "The simulated disruption was handled; all constraints still pass." : "Required work is unsafe. The simulated runtime is SUSPENDED; recover the failure or roll back.");
}

async function recover() {
  const previous = state.lastEvent;
  if (!previous && $("#event-type").value !== "DEVICE_UNAVAILABLE") { setStatus("Inject a simulated disruption before testing recovery."); return false; }
  const event = !previous || previous.type === "DEVICE_UNAVAILABLE" ? { type: "DEVICE_RECOVERED", capability: previous?.capability ?? $("#event-capability").value } : previous.type === "TRAVEL_DELAY" ? { type: "TRAVEL_DELAY", minutes: previous.previousContext.travelDelayMinutes ?? 0 } : { type: "WEATHER_CHANGED", raining: previous.previousContext.weather.raining };
  const result = await client.callTool("routine.inject_event", { activationId: state.activation.id, event });
  adoptRuntime(result); state.lastEvent = null;
  setStatus(result.simulation.status === "PASSED" ? "Recovery verified. Only approved work is scheduled again." : "Recovery still has conflicts. Runtime remains SUSPENDED; restore other failures or roll back.");
}

function adoptRuntime(result) {
  state.activation = result.activation; state.simulation = result.simulation; state.proposal.routine = result.activation.runtimeState.routine; state.proposal.status = result.activation.status; render(); enable("rollback");
}

async function rollback() {
  const confirmed = await confirmAction($("#approval-dialog"), $("#approval-copy"), { title: "Restore the simulated snapshot?", confirmLabel: "Confirm rollback", message: "Stop this virtual routine and restore its pre-activation device/context snapshot. This does not undo physical device actions." });
  if (!confirmed) { setStatus("Rollback cancelled; the current virtual runtime was not changed."); return false; }
  const result = await client.callTool("routine.rollback", { activationId: state.activation.id, confirmed: true });
  state.activation = result.activation; state.proposal.status = "ROLLED_BACK"; render();
  state.enabled = new Set(["compile"]);
  const audit = await client.callTool("audit.get_trace", { proposalId: state.proposal.id });
  setStatus(`Rollback complete. ${audit.events.length} lifecycle events are available for audit.`);
}

function planningOptions() {
  return { scenarioId: $("#household").value, dataMode: $("#data-mode").value, ...($("#planning-date").value ? { date: $("#planning-date").value } : {}), time: $("#planning-time").value || "07:00", includeTraffic: $("#include-traffic").checked };
}
async function exclusive(operation) {
  if (state.busy || state.running || !state.connected) return;
  state.busy = true; refreshButtons();
  try { return await operation(); } finally { state.busy = false; refreshButtons(); }
}
async function askAssistant() {
  if ($("#planner").value !== "gemini") { setStatus("Choose Gemini to chat, or use Compile / the labelled fixture demo offline."); return; }
  const message = $("#goal").value; assistantMessage("You", message); setStatus("Gemini is reading the household and available MCP tools…");
  const response = await client.callTool("assistant.respond", { message, ...planningOptions(), ...(state.proposal && !state.activation ? { proposalId: state.proposal.id } : {}) });
  assistantMessage("Rehearse", response.reply ?? response.result?.explanation ?? "Review the result.");
  const result = response.result;
  if (response.needsClarification) { assistantMessage("Clarification", (response.questions ?? result?.questions ?? []).join(" ")); setStatus("Answer the questions in your request, then ask again."); return; }
  addTrace("assistant selection", response.selectedTool);
  if (response.operation === "plan") adoptCompiled(result);
  else if (response.operation === "request_approval") await approve(result);
  else if (result.proposal) {
    state.proposal = result.proposal; state.simulation = result.simulation ?? state.simulation;
    state.activation = result.activation ?? null; state.approval = null; render();
    if (!state.activation) { enable("simulate"); enable("repair"); enable("revise"); if (state.proposal.status === "VERIFIED") enable("approve"); else state.enabled.delete("approve"); }
  } else if (result.simulation) {
    state.simulation = result.simulation; state.proposal.status = result.safeToActivate ? "VERIFIED" : "NEEDS_REPAIR"; render(); enable(result.safeToActivate ? "approve" : "repair");
  }
  if (response.operation !== "request_approval") setStatus(`Gemini selected ${response.selectedTool}. Check the evidence and current proposal state.`);
}
function assistantMessage(label, message) {
  const container = $("#assistant-output");
  const item = document.createElement("div"); item.className = "finding good";
  const title = document.createElement("b"); title.textContent = label;
  const text = document.createElement("p"); text.textContent = message;
  item.append(title,text); container.append(item); container.scrollTop = container.scrollHeight;
  while (container.children.length > 40) container.firstElementChild.remove();
}
function renderHouseholdOptions() { $("#household").replaceChildren(...state.households.map(profile => new Option(profile.name, profile.id))); }
function selectHousehold(loadGoal = true) {
  const profile = state.households.find(item => item.id === $("#household").value); if (!profile) return;
  const builtIn = ["school-morning","work-morning","evening-guests"].includes(profile.id);
  $("#household-json").value = JSON.stringify({ ...profile, ...(builtIn ? { id: `custom-${profile.id}`, name: `My ${profile.name}` } : {}) }, null, 2);
  if (loadGoal !== false) {
    const goals = { "school-morning": fixtureGoal, "work-morning": "Alex needs 30 minutes to get ready starting at 7:00 and must leave for work by 7:45. Boil water for 5 minutes and toast breakfast for 4 minutes at 7:05. Announce breakfast at 6:55. Keep quiet until 7:00 and leave 10 minutes earlier if it rains. Both breakfast tasks are required, not optional.", "evening-guests": "Have dinner cooked in the oven for 30 minutes by 19:00. Wash dishes for 40 minutes afterwards. Vacuum the living room for 15 minutes at 17:50, while quiet hours last until 18:00. Turn on the living-room light for 10 minutes at 18:45. These tasks are required. The host coordinates; no departure is needed." };
    $("#goal").value = goals[profile.id] ?? `Plan a routine for ${profile.name}. `;
    const revisions = { "school-morning": "On Fridays, Maya can wake at 6:50, but keep everything else unchanged.", "work-morning": "Move the announcement to 7:00 and keep all other household policies unchanged.", "evening-guests": "Move vacuuming to 18:00 and keep all other household policies and task deadlines unchanged." };
    $("#revision").value = revisions[profile.id] ?? "Move the first scheduled step five minutes later, keeping all policies and deadlines unchanged.";
    $("#planning-time").value = profile.id === "evening-guests" ? "18:00" : "07:00";
    if (profile.id !== "school-morning") $("#planner").value = "gemini";
  }
}
async function saveHousehold() {
  const profile = JSON.parse($("#household-json").value);
  const confirmed = await confirmAction($("#approval-dialog"), $("#approval-copy"), { title: "Save this household profile?", confirmLabel: "Confirm profile save", message: `Save ${profile.name}? Review the people, capabilities, power ratings, quiet policy, and coordinates first. Existing proposals retain their own snapshots.` });
  if (!confirmed) return;
  const result = await client.callTool("household.configure", { profile, confirmed: true });
  state.households = (await client.callTool("household.list_profiles")).profiles; renderHouseholdOptions(); $("#household").value = result.profile.id; selectHousehold(false);
  setStatus("Household saved for this demo identity. Export it before resetting; existing proposals are unchanged.");
}
function exportHousehold() {
  const value = JSON.parse($("#household-json").value); const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "rehearse-household.json"; link.click(); URL.revokeObjectURL(url);
}
async function refreshEnvironment() {
  const result = await client.callTool("routine.refresh_environment", { proposalId: state.proposal.id });
  state.proposal = result.proposal; state.simulation = result.simulation; state.approval = null;
  if (result.simulation.status === "PASSED") enable("approve"); else { state.enabled.delete("approve"); enable("repair"); }
  render(); setStatus("Live context refreshed and version incremented. Any old approval is stale.");
}

function render() {
  const proposal = state.proposal; if (!proposal) return;
  $("#proposal-title").textContent = proposal.routine.title; $("#proposal-state").textContent = proposal.status; $("#proposal-state").className = `pill ${proposal.status === "ACTIVE" ? "active" : ["NEEDS_REPAIR","NEEDS_INPUT","SUSPENDED"].includes(proposal.status) ? "failed" : ""}`;
  $("#version").textContent = `v${proposal.version}`; $("#entities").textContent = proposal.microTwin.people.length + proposal.microTwin.devices.length;
  const count = state.simulation?.violations?.filter((item) => item.severity === "critical").length ?? "—"; $("#violations").textContent = count;
  const departure = proposal.routine.steps.find((step) => step.departure); $("#departure").textContent = departure?.startTime ?? "—";
  const checked = state.simulation?.summary?.checkedConstraints ?? proposal.routine.constraints.length; const failedConstraints = new Set(state.simulation?.violations?.map((item) => item.constraintId) ?? []).size; $("#score").textContent = state.simulation ? `${checked - failedConstraints}/${checked}` : `0/${checked}`;
  renderTimeline(proposal.routine.steps); renderTwin(proposal.microTwin); renderFindings(state.simulation?.violations);
  renderEvidence(proposal.routine.context);
  const selected = $("#event-capability").value;
  const deviceIds = new Set(proposal.microTwin.devices.map(device => device.id));
  const actions = state.activation?.runtimeState.approvedRoutine?.steps ?? proposal.routine.steps;
  $("#event-capability").replaceChildren(...[...new Set(actions.filter(step => deviceIds.has(step.targetId)).map(step => step.capability))].map(capability => new Option(capability, capability)));
  if ([...$("#event-capability").options].some(option => option.value === selected)) $("#event-capability").value = selected;
  refreshButtons();
}

function renderEvidence(context) {
  const container = $("#evidence"); container.replaceChildren();
  if (!context.evidence?.length) { const text = document.createElement("p"); text.className = "status"; text.textContent = context.dataMode === "none" ? "No external provider selected. Environment is an explicit assumption." : "Fixture environment — synthetic data, not live weather or traffic."; container.append(text); return; }
  for (const evidence of context.evidence) {
    const item = document.createElement("p"); item.textContent = `${evidence.provider} · ${evidence.source} · ${evidence.cached ? "cached" : "fetched"} at ${evidence.retrievedAt}. ${evidence.provider === "Open-Meteo" ? `${evidence.validFor} (${evidence.timezone}), ${evidence.temperatureC}°C, ${evidence.precipitationMm} mm precipitation.` : `${evidence.travelMinutes} minute route; ${evidence.delayMinutes} minute current traffic delay. ${evidence.note}`}`;
    const attribution = document.createElement("a"); attribution.textContent = evidence.attribution; attribution.href = evidence.provider === "Open-Meteo" ? "https://open-meteo.com/" : "https://www.tomtom.com/"; attribution.target = "_blank"; attribution.rel = "noopener noreferrer";
    container.append(item,attribution);
  }
}

function renderTimeline(steps) {
  const start = Math.floor(Math.min(...steps.map((step) => step.startMinute)) / 30) * 30;
  const end = Math.ceil(Math.max(...steps.map((step) => step.endMinute)) / 30) * 30;
  const span = end - start;
  document.querySelector('.timeline-card .card-title span').textContent = `${clock(start)} — ${clock(end)}`;
  const html = ['<div class="timeline-grid">', ...[0, 25, 50, 75, 100].map((percent) => `<i style="left:${percent}%" data-time="${clock(Math.round(start + span * percent / 100))}"></i>`), "</div>"];
  for (const step of steps) {
    const left = Math.max(0, Math.min(99, (step.startMinute - start) / span * 100));
    const width = Math.min(100 - left, Math.max(1, step.durationMinutes / span * 100));
    const kind = step.departure ? "departure" : step.audible ? "audible" : step.capability === "prepare_person" ? "person" : "";
    html.push(`<div class="timeline-row"><span class="timeline-label">${step.startTime} · ${escape(step.label)}</span><div class="timeline-step ${kind}" style="left:${left}%;width:${width}%" title="${escape(step.label)} · ${step.startTime}–${step.endTime}"></div></div>`);
  }
  $("#timeline").className = "timeline"; $("#timeline").innerHTML = html.join("");
}

function renderTwin(twin) {
  $("#twin").className = "twin"; $("#twin").innerHTML = `<div class="entity-group"><span>People</span><div class="chips">${twin.people.map((item) => `<span class="chip">${escape(item.name)}</span>`).join("")}</div></div><div class="entity-group"><span>Devices</span><div class="chips">${twin.devices.map((item) => `<span class="chip">${escape(item.name)}</span>`).join("")}</div></div><div class="entity-group"><span>Deliberately excluded</span><div class="chips"><span class="chip">${twin.excludedEntityCount} unrelated entities</span></div></div>`;
}

function renderFindings(findings) {
  $("#finding-count").textContent = findings?.length ?? 0;
  if (!findings) { $("#findings").className = "findings empty"; $("#findings").innerHTML = "<p>No simulation yet.</p>"; return; }
  if (!findings.length) {
    const explanation = state.activation?.status === "ROLLED_BACK" ? "Routine stopped and virtual snapshot restored. These findings describe the last rehearsal." : state.activation ? "The latest virtual runtime passes the stored checks." : "The candidate passes the stored checks; activation still requires your approval.";
    $("#findings").className = "findings";
    $("#findings").innerHTML = `<div class="finding good"><b>IMPLEMENTED CONSTRAINTS PASS</b><p>${explanation}</p></div>`; return;
  }
  $("#findings").className = "findings"; $("#findings").innerHTML = findings.map((item) => `<div class="finding"><b>${escape(item.code)}</b><p>${escape(item.message)}</p></div>`).join("");
}

function addTrace(method, detail) { const trace = $("#trace"); if (trace.children[0]?.textContent.includes("Waiting")) trace.innerHTML = ""; const item = document.createElement("li"); item.innerHTML = `<time>${new Date().toLocaleTimeString([], { hour12:false })}</time><span>${escape(method)} · ${escape(detail)}</span>`; trace.prepend(item); while (trace.children.length > 100) trace.lastElementChild.remove(); }
function enable(action) { state.enabled.add(action); refreshButtons(); }
function refreshButtons() {
  document.querySelectorAll("[data-action]").forEach((button) => { button.disabled = !state.connected || state.busy || state.running || !state.enabled.has(button.dataset.action); });
  $("#guided").disabled = !state.connected || state.busy || state.running || Boolean(state.activation && ["ACTIVE", "SUSPENDED"].includes(state.activation.status));
  $("#reset").disabled = state.busy || state.running || Boolean(state.activation && ["ACTIVE","SUSPENDED"].includes(state.activation.status));
  for (const selector of ["#ask","#save-household","#export-household"]) $(selector).disabled = !state.connected || state.busy || state.running || (selector === "#ask" && Boolean(state.activation && ["ACTIVE","SUSPENDED"].includes(state.activation.status)));
  for (const selector of ["#planner","#household","#data-mode","#include-traffic","#planning-date","#planning-time"]) $(selector).disabled = state.busy || state.running;
  $("#refresh-environment").disabled = !state.connected || state.busy || state.running || !state.proposal || state.proposal.context.dataMode !== "live" || ["ACTIVE","SUSPENDED","ROLLED_BACK"].includes(state.proposal.status);
}
function markDone(action) { document.querySelector(`[data-action="${action}"]`)?.classList.add("done"); }
function setStatus(value) { $("#status").textContent = value; }
function showError(error) { setStatus(`${error.code ?? "ERROR"}: ${error.message}`); console.error(error); }
function pause(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function clock(minute) { return `${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`; }
function escape(value) { const node = document.createElement("span"); node.textContent = String(value); return node.innerHTML.replaceAll('"', '&quot;'); }
const statusText = { compile:"Extracting tasks and compiling an inert temporal plan…", simulate:"Running the routine in the temporary micro-twin…", repair:"Repairing conflicts that do not require a value judgment…", revise:"Interpreting an explicit user revision…", approve:"Preparing a version-bound approval…", disrupt:"Injecting a labelled simulated disruption…", recover:"Restoring approved actions and reverifying recovery…", rollback:"Stopping the runtime and restoring the captured snapshot…" };
