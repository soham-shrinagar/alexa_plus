import { AppError } from "../errors.js";

export function findFreeSlots({ events, rangeStart, rangeEnd, durationMinutes, workingHours = { start: 9, end: 18 }, limit = 3 }) {
  const start = new Date(rangeStart); const end = new Date(rangeEnd); if (!(start < end) || durationMinutes < 1) throw new AppError("INVALID_SCHEDULE_REQUEST", "A valid date range and duration are required.", { status: 400 });
  const busy = events.map((event) => ({ start: new Date(event.startTime), end: new Date(event.endTime) })).filter((event) => event.end > start && event.start < end).sort((a, b) => a.start - b.start); const slots = [];
  for (let day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); day < end && slots.length < limit; day.setUTCDate(day.getUTCDate() + 1)) { let cursor = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), workingHours.start)); const dayEnd = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), workingHours.end)); if (cursor < start) cursor = new Date(start); for (const event of busy.filter((item) => item.start < dayEnd && item.end > cursor)) { if (event.start - cursor >= durationMinutes * 60_000) slots.push(slot(cursor, new Date(cursor.getTime() + durationMinutes * 60_000))); if (slots.length >= limit) return slots; if (event.end > cursor) cursor = new Date(event.end); } if (dayEnd - cursor >= durationMinutes * 60_000) slots.push(slot(cursor, new Date(cursor.getTime() + durationMinutes * 60_000))); }
  return slots;
}
export function hasConflict(events, startTime, endTime) { const start = new Date(startTime); const end = new Date(endTime); return events.some((event) => new Date(event.startTime) < end && new Date(event.endTime) > start); }
function slot(start, end) { return { startTime: start.toISOString(), endTime: end.toISOString() }; }
