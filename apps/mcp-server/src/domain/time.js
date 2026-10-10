import { AppError } from "../errors.js";

export function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  if (!match) throw new AppError("INVALID_TIME", `Expected HH:MM but received ${value}.`, { status: 400 });
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new AppError("INVALID_TIME", `Expected HH:MM but received ${value}.`, { status: 400 });
  return hours * 60 + minutes;
}

export function toClock(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function overlaps(left, right) {
  return left.startMinute < right.endMinute && right.startMinute < left.endMinute;
}

export function withTiming(step, startMinute) {
  return { ...step, startMinute, endMinute: startMinute + step.durationMinutes, startTime: toClock(startMinute), endTime: toClock(startMinute + step.durationMinutes) };
}
