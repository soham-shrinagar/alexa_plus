import { McpBrowserClient } from "./mcpClient.js";

const $ = (selector) => document.querySelector(selector);
const state = { client: null, tools: [], proposal: null, simulation: null, approval: null, activation: null, running: false };
const actionOrder = ["compile", "simulate", "repair", "revise", "approve", "disrupt", "rollback"];

const client = new McpBrowserClient({ onActivity: (method, detail) => addTrace(method, detail) });
state.client = client;

$("#guided").addEventListener("click", guidedDemo);
$("#reset").addEventListener("click", () => location.reload());
document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => runAction(button.dataset.action)));

connect().catch(showError);

async function connect() {
  setStatus("Opening a secured Streamable HTTP session…");
  await client.connect(); state.tools = await client.listTools();
  $("#connection-dot").classList.add("live"); $("#connection-label").textContent = "Browser ↔ MCP live";
  enable("compile"); setStatus(`${state.tools.length} MCP tools discovered. Ready to compile.`);
}

async function guidedDemo() {
  if (state.running) return;
  state.running = true; $("#guided").disabled = true;
  try { for (const action of actionOrder) { await runAction(action); await pause(action === "approve" ? 300 : 650); } }
  finally { state.running = false; $("#guided").disabled = false; }
}

async function runAction(action) {
  const handlers = { compile, simulate, repair, revise, approve, disrupt, rollback };
  try { setStatus(statusText[action]); await handlers[action](); markDone(action); }
  catch (error) { showError(error); throw error; }
}

async function compile() {
  const result = await client.callTool("routine.compile", { goal: $("#goal").value, scenarioId: "school-morning" });
  state.proposal = result.proposal; state.simulation = null; render(); enable("simulate");
  setStatus("Candidate compiled. The micro-twin contains only entities this routine references.");
}

async function simulate() {
  const result = await client.callTool("simulation.run", { proposalId: state.proposal.id });
  state.simulation = result.simulation; state.proposal.status = result.safeToActivate ? "VERIFIED" : "NEEDS_REPAIR"; render(); enable("repair");
  setStatus(`${result.simulation.violations.length} conflicts exposed before any action ran.`);
}

async function repair() {
  const result = await client.callTool("routine.repair", { proposalId: state.proposal.id });
  state.proposal = result.proposal; state.simulation = result.simulation; render(); enable("revise");
  setStatus("Power, quiet-hours, and rain timing repaired. One family decision remains.");
}

async function revise() {
  const result = await client.callTool("routine.revise", { proposalId: state.proposal.id, instruction: "On Fridays, Maya can wake at 6:50, but keep everything else unchanged." });
  state.proposal = result.proposal; state.simulation = result.simulation; render(); enable("approve");
  setStatus("Explicit exception applied. The revised version passes every constraint.");
}

async function approve() {
  const request = await client.callTool("routine.request_activation", { proposalId: state.proposal.id }); state.approval = request.approval;
  const confirmed = state.running ? true : await confirmActivation(request);
  if (!confirmed) { setStatus("Activation cancelled; the verified proposal remains inert."); return; }
  const result = await client.callTool("routine.activate", { proposalId: state.proposal.id, approvalId: request.approval.id, confirmed: true, idempotencyKey: `web-${state.proposal.id}-v${state.proposal.version}` });
  state.activation = result.activation; state.proposal.status = "ACTIVE"; render(); enable("disrupt");
  setStatus("Exact verified version activated in the simulated runtime; rollback snapshot captured.");
}

async function disrupt() {
  let result = await client.callTool("routine.inject_event", { activationId: state.activation.id, event: { type: "DEVICE_UNAVAILABLE", capability: "make_coffee" } });
  result = await client.callTool("routine.inject_event", { activationId: state.activation.id, event: { type: "TRAVEL_DELAY", minutes: 5 } });
  state.activation = result.activation; state.simulation = result.simulation; state.proposal.routine = result.activation.runtimeState.routine; render(); enable("rollback");
  setStatus("Coffee was skipped and departure advanced five minutes. The adapted plan still verifies.");
}

async function rollback() {
  const result = await client.callTool("routine.rollback", { activationId: state.activation.id, confirmed: true });
  state.activation = result.activation; state.proposal.status = "ROLLED_BACK"; render();
  const audit = await client.callTool("audit.get_trace", { proposalId: state.proposal.id });
  setStatus(`Rollback complete. ${audit.events.length} lifecycle events are available for audit.`);
}

function render() {
  const proposal = state.proposal; if (!proposal) return;
  $("#proposal-title").textContent = proposal.routine.title; $("#proposal-state").textContent = proposal.status; $("#proposal-state").className = `pill ${proposal.status === "ACTIVE" ? "active" : ["NEEDS_REPAIR","NEEDS_INPUT"].includes(proposal.status) ? "failed" : ""}`;
  $("#version").textContent = `v${proposal.version}`; $("#entities").textContent = proposal.microTwin.people.length + proposal.microTwin.devices.length;
  const count = state.simulation?.violations?.filter((item) => item.severity === "critical").length ?? "—"; $("#violations").textContent = count;
  const departure = proposal.routine.steps.find((step) => step.departure); $("#departure").textContent = departure?.startTime ?? "—";
  const checked = state.simulation?.summary?.checkedConstraints ?? proposal.routine.constraints.length; const failedConstraints = new Set(state.simulation?.violations?.map((item) => item.constraintId) ?? []).size; $("#score").textContent = state.simulation ? `${checked - failedConstraints}/${checked}` : `0/${checked}`;
  renderTimeline(proposal.routine.steps); renderTwin(proposal.microTwin); renderFindings(state.simulation?.violations);
}

function renderTimeline(steps) {
  const html = ['<div class="timeline-grid">', ...[360,390,420,450,480].map((minute) => `<i data-time="${clock(minute)}"></i>`), "</div>"];
  for (const step of steps) { const left = Math.max(0, (step.startMinute - 360) / 120 * 100); const width = Math.max(2.5, step.durationMinutes / 120 * 100); const kind = step.departure ? "departure" : step.audible ? "audible" : step.capability === "prepare_person" ? "person" : ""; html.push(`<div class="timeline-row"><div class="timeline-step ${kind}" style="left:${left}%;width:${width}%" title="${escape(step.label)} · ${step.startTime}–${step.endTime}">${step.startTime} · ${escape(step.label)}</div></div>`); }
  $("#timeline").className = "timeline"; $("#timeline").innerHTML = html.join("");
}

function renderTwin(twin) {
  $("#twin").className = "twin"; $("#twin").innerHTML = `<div class="entity-group"><span>People</span><div class="chips">${twin.people.map((item) => `<span class="chip">${escape(item.name)}</span>`).join("")}</div></div><div class="entity-group"><span>Devices</span><div class="chips">${twin.devices.map((item) => `<span class="chip">${escape(item.name)}</span>`).join("")}</div></div><div class="entity-group"><span>Deliberately excluded</span><div class="chips"><span class="chip">${twin.excludedEntityCount} unrelated entities</span></div></div>`;
}

function renderFindings(findings) {
  $("#finding-count").textContent = findings?.length ?? 0;
  if (!findings) { $("#findings").className = "findings empty"; $("#findings").innerHTML = "<p>No simulation yet.</p>"; return; }
  if (!findings.length) { $("#findings").className = "findings"; $("#findings").innerHTML = '<div class="finding good"><b>ALL CONSTRAINTS PASS</b><p>The current proposal is safe to request for activation.</p></div>'; return; }
  $("#findings").className = "findings"; $("#findings").innerHTML = findings.map((item) => `<div class="finding"><b>${escape(item.code)}</b><p>${escape(item.message)}</p></div>`).join("");
}

function addTrace(method, detail) { const trace = $("#trace"); if (trace.children[0]?.textContent.includes("Waiting")) trace.innerHTML = ""; const item = document.createElement("li"); item.innerHTML = `<time>${new Date().toLocaleTimeString([], { hour12:false })}</time><span>${escape(method)} · ${escape(detail)}</span>`; trace.prepend(item); }
function enable(action) { document.querySelector(`[data-action="${action}"]`)?.removeAttribute("disabled"); }
function markDone(action) { document.querySelector(`[data-action="${action}"]`)?.classList.add("done"); }
function setStatus(value) { $("#status").textContent = value; }
function showError(error) { setStatus(`${error.code ?? "ERROR"}: ${error.message}`); console.error(error); }
function pause(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function clock(minute) { return `${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`; }
function escape(value) { const node = document.createElement("span"); node.textContent = String(value); return node.innerHTML; }
function confirmActivation(request) { const dialog = $("#approval-dialog"); $("#approval-copy").textContent = `Version ${request.proposalVersion} passed verification. It references ${request.impact.devices.length} devices and ${request.impact.steps} steps. Your approval is cryptographically bound to this exact version.`; dialog.showModal(); return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once:true })); }

const statusText = { compile:"Compiling the goal into a temporal plan…", simulate:"Running the routine in the temporary micro-twin…", repair:"Repairing conflicts that do not require a value judgment…", revise:"Applying the family's explicit Friday exception…", approve:"Preparing a version-bound approval…", disrupt:"Injecting a coffee-machine failure and five-minute travel delay…", rollback:"Stopping the runtime and restoring the captured snapshot…" };
