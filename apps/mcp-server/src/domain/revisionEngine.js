import { AppError } from "../errors.js";
import { simulateRoutine } from "./constraintEngine.js";
import { toMinutes, toClock, withTiming } from "./time.js";

export function reviseRoutine(routine, instruction) {
  const match = instruction.match(/Maya\s+(?:can|may)\s+(?:wake|start)(?:\s+up)?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?)?/i);
  if (!match) throw new AppError("UNSUPPORTED_REVISION", "The bounded demo parser supports a Maya start-time exception, for example: 'On Fridays, Maya can wake at 6:50'.", { status: 400 });
  const minute = toMinutes(`${String(Number(match[1])).padStart(2, "0")}:${match[2] ?? "00"}`);
  const fridayOnly = /\bFridays?\b/i.test(instruction);
  if (/\b(?:Monday|Tuesday|Wednesday|Thursday|Saturday|Sunday)s?\b/i.test(instruction)) throw new AppError("UNSUPPORTED_REVISION", "This demo supports a Friday exception or an unqualified start time for this routine.", { status: 400 });
  const constraints = routine.constraints.map((constraint) => constraint.id === "maya-earliest" ? { ...constraint, ...(fridayOnly ? { exceptions: { ...constraint.exceptions, Friday: minute } } : { atMinute: minute, exceptions: {} }), label: `Maya may start at ${toClock(minute)}${fridayOnly ? " on Fridays only" : " for this routine"}`, source: "explicit-user-revision" } : constraint);
  const applies = !fridayOnly || routine.context.weekday === "Friday";
  const steps = routine.steps.map((step) => step.id === "maya-ready" && applies ? withTiming(step, minute) : step);
  const revised = { ...routine, steps, constraints, revisionNote: instruction };
  return { routine: revised, changes: [{ type: "CONSTRAINT", id: "maya-earliest", value: minute }, { type: "STEP", id: "maya-ready", startMinute: minute }], simulation: simulateRoutine(revised) };
}
