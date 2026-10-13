import { AsyncLocalStorage } from "node:async_hooks";
const active = new AsyncLocalStorage();
export const withTimings = (spans, operation) => active.run(spans, operation);
export async function timeAsync(stage, operation) {
  const start = performance.now();
  let status = "error";
  try {
    const result = await operation();
    status = "success";
    return result;
  } finally {
    active
      .getStore()
      ?.push({
        stage,
        status,
        latencyMs: Math.round((performance.now() - start) * 100) / 100,
      });
  }
}
export function timeSync(stage, operation) {
  const start = performance.now();
  let status = "error";
  try {
    const result = operation();
    status = "success";
    return result;
  } finally {
    active
      .getStore()
      ?.push({
        stage,
        status,
        latencyMs: Math.round((performance.now() - start) * 100) / 100,
      });
  }
}
// Inclusive transaction and operation spans overlap; never sum them.
export function instrumentRepository(repository) {
  for (const name of Object.getOwnPropertyNames(
    Object.getPrototypeOf(repository),
  )) {
    if (name === "constructor" || typeof repository[name] !== "function")
      continue;
    const original = repository[name].bind(repository);
    repository[name] = (...args) =>
      timeAsync(`database.${name}`, () => original(...args));
  }
}
