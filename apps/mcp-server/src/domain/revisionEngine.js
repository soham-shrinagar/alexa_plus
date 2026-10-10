import { AppError } from "../errors.js";
import { simulateRoutine } from "./constraintEngine.js";
import { toMinutes, withTiming } from "./time.js";

export function reviseRoutine(routine, instruction) {
  const match = instruction.match(/Maya[^0-9]*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?)?/i);
  if (!match) throw new AppError("UNSUPPORTED_REVISION", "The bounded demo parser supports a Maya start-time exception, for example: 'On Fridays, Maya can wake at 6:50'.", { status: 400 });
  const minute = toMinutes(`${String(Number(match[1])).padStart(2, "0")}:${match[2] ?? "00"}`);
  const constraints = routine.constraints.map((constraint) => constraint.id === "maya-earliest" ? { ...constraint, atMinute: minute, label: `Maya may start at ${String(match[1]).padStart(2, "0")}:${match[2] ?? "00"} for this routine`, source: "explicit-user-revision" } : constraint);
  const steps = routine.steps.map((step) => step.id === "maya-ready" ? withTiming(step, minute) : step);
  const revised = { ...routine, steps, constraints, revisionNote: instruction };
  return { routine: revised, changes: [{ type: "CONSTRAINT", id: "maya-earliest", value: minute }, { type: "STEP", id: "maya-ready", startMinute: minute }], simulation: simulateRoutine(revised) };
}
