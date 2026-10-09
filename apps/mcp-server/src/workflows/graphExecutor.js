import { AppError } from "../errors.js";

export async function executeGraph({ steps, onUpdate, maxConcurrency = 3, timeoutMs = 10_000 }) {
  validateGraph(steps); const pending = new Map(steps.map((step) => [step.id, { ...step, status: "PENDING" }])); const results = {}; const failed = [];
  while (pending.size) {
    const ready = [...pending.values()].filter((step) => step.dependsOn.every((id) => results[id]?.status === "SUCCEEDED"));
    const blocked = [...pending.values()].filter((step) => step.dependsOn.some((id) => results[id] && results[id].status !== "SUCCEEDED"));
    for (const step of blocked) { pending.delete(step.id); results[step.id] = { status: "SKIPPED", errorCode: "PREREQUISITE_FAILED" }; await onUpdate?.(step.id, results[step.id]); }
    if (!ready.length) { if (pending.size) throw new AppError("WORKFLOW_STALLED", "The workflow could not find an executable step."); continue; }
    await Promise.all(ready.slice(0, maxConcurrency).map(async (step) => { pending.delete(step.id); await onUpdate?.(step.id, { status: "RUNNING" }); try { const value = await withTimeout(() => step.run(results), timeoutMs); results[step.id] = { status: "SUCCEEDED", value }; } catch (error) { results[step.id] = { status: "FAILED", errorCode: error.code ?? "STEP_FAILED", message: error.message }; failed.push(step.id); } await onUpdate?.(step.id, results[step.id]); }));
  }
  return { status: failed.length ? "PARTIALLY_COMPLETED" : "VERIFIED", results };
}

function validateGraph(steps) { const ids = new Set(steps.map((step) => step.id)); if (ids.size !== steps.length || steps.some((step) => step.dependsOn.some((id) => !ids.has(id)))) throw new AppError("INVALID_PLAN", "The workflow plan has duplicate or unknown dependencies.", { status: 400 }); const visiting = new Set(); const visited = new Set(); const visit = (id) => { if (visiting.has(id)) throw new AppError("CIRCULAR_DEPENDENCY", "The workflow plan contains a circular dependency.", { status: 400 }); if (visited.has(id)) return; visiting.add(id); steps.find((step) => step.id === id).dependsOn.forEach(visit); visiting.delete(id); visited.add(id); }; steps.forEach((step) => visit(step.id)); }
async function withTimeout(operation, timeoutMs) { let timer; try { return await Promise.race([operation(), new Promise((_, reject) => { timer = setTimeout(() => reject(new AppError("WORKFLOW_TIMEOUT", "A workflow step timed out.", { retryable: true })), timeoutMs); })]); } finally { clearTimeout(timer); } }
