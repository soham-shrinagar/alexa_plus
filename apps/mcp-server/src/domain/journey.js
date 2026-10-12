import { z } from "zod";
import { AppError } from "../errors.js";
import { withTiming, toMinutes, toClock } from "./time.js";
import { householdConstraints } from "./household.js";

export const placeSchema = z
  .object({
    label: z.string().min(1).max(250),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();
export const journeyInputSchema = z
  .object({
    goal: z.string().min(3).max(2000),
    origin: placeSchema,
    destination: placeSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    arrivalTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().min(1).max(80),
    travelMode: z.enum(["car", "pedestrian", "bicycle"]).default("car"),
    earliestStartTime: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    extraDelayMinutes: z.number().int().min(0).max(60).default(0),
    tasks: z
      .array(
        z
          .object({
            label: z.string().min(1).max(200),
            durationMinutes: z.number().int().min(1).max(240),
          })
          .strict(),
      )
      .max(15)
      .default([]),
    preparationMinutes: z.number().int().min(0).max(240).default(20),
    safetyBufferMinutes: z.number().int().min(0).max(60).default(10),
    rainBufferMinutes: z.number().int().min(0).max(60).default(10),
    reminderLeadMinutes: z.number().int().min(0).max(120).default(5),
  })
  .strict();

// Resolve a local clock without depending on the server's timezone. DST gaps
// and folds are deliberately rejected instead of silently choosing an instant.
export function localInstant(date, time, timezone) {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new AppError(
      "INVALID_TIMEZONE",
      "Use an IANA timezone such as Asia/Kolkata.",
      { status: 400 },
    );
  }
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (
    !Number.isFinite(naive) ||
    new Date(naive).toISOString().slice(0, 16) !== `${date}T${time}`
  )
    throw new AppError(
      "INVALID_DATE",
      "Supply a real calendar date and time.",
      { status: 400 },
    );
  const parts = (instant) =>
    Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
    );
  const offsets = new Set(
    [-36, -12, 0, 12, 36].map((hours) => {
      const at = naive + hours * 3600000;
      const p = parts(at);
      return (
        Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) -
        at
      );
    }),
  );
  const matches = [...offsets]
    .map((offset) => naive - offset)
    .filter((at) => {
      const p = parts(at);
      return (
        `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` ===
        `${date}T${time}`
      );
    });
  if (matches.length !== 1)
    throw new AppError(
      "AMBIGUOUS_LOCAL_TIME",
      "That time is skipped or repeated by daylight saving. Choose an unambiguous time.",
      { status: 400 },
    );
  return matches[0];
}

import { timeSync } from "../timing.js";
export function buildJourney(input, profile, route, weather, now = Date.now()) {
  return timeSync("planning.journey", () =>
    compileJourney(input, profile, route, weather, now),
  );
}
function compileJourney(input, profile, route, weather, now) {
  const arrivalMinute = toMinutes(input.arrivalTime);
  const rainMinutes = weather.raining ? input.rainBufferMinutes : 0;
  const departureMinute =
    arrivalMinute -
    route.travelMinutes -
    input.extraDelayMinutes -
    input.safetyBufferMinutes -
    rainMinutes;
  const tasks = [
    ...(input.preparationMinutes
      ? [{ label: "Get ready", durationMinutes: input.preparationMinutes }]
      : []),
    ...input.tasks,
  ];
  const totalPreparation = tasks.reduce(
    (sum, task) => sum + task.durationMinutes,
    0,
  );
  const startMinute = departureMinute - totalPreparation;
  const reminderMinute = startMinute - input.reminderLeadMinutes;
  if (reminderMinute < 0 || arrivalMinute > 1439)
    throw new AppError(
      "CROSS_DAY_PLAN",
      "Preparation or the reminder falls on the previous day. This MVP supports a single local day; choose a later arrival or shorter preparation.",
      { status: 422 },
    );
  const reminderAt = localInstant(
    input.date,
    toClock(reminderMinute),
    input.timezone,
  );
  if (reminderAt <= now)
    throw new AppError(
      "PLAN_ALREADY_STARTED",
      "The calculated reminder/preparation time has already passed. Choose a later deadline; a past reminder cannot be delivered.",
      { status: 422 },
    );
  const arrivalAt = localInstant(input.date, input.arrivalTime, input.timezone);
  const departureAt = localInstant(
    input.date,
    toClock(departureMinute),
    input.timezone,
  );
  if (
    (arrivalAt - departureAt) / 60000 !== arrivalMinute - departureMinute ||
    (departureAt - reminderAt) / 60000 !== departureMinute - reminderMinute
  )
    throw new AppError(
      "DST_CROSSING",
      "Plans crossing a daylight-saving transition are not supported yet.",
      { status: 422 },
    );
  const context = {
    weekday: new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: input.timezone,
    }).format(new Date(arrivalAt)),
    weather: { raining: weather.raining },
    travelDelayMinutes: 0,
    unavailableCapabilities: [],
    dataMode: "live",
    evidence: [route, weather],
    planningDate: input.date,
    planningTime: input.arrivalTime,
  };
  let cursor = startMinute;
  const steps = tasks.map((task, i) => {
    const step = withTiming(
      {
        id: `prepare-${i + 1}`,
        label: task.label,
        targetId: "self",
        capability: "manual_task",
        durationMinutes: task.durationMinutes,
        requiredForDeparture: true,
        optional: false,
        departure: false,
        powerWatts: 0,
        audible: false,
        dependsOn: i ? [`prepare-${i}`] : [],
      },
      cursor,
    );
    cursor += task.durationMinutes;
    return step;
  });
  steps.push(
    withTiming(
      {
        id: "depart",
        label: `Leave for ${input.destination.label}`,
        targetId: "self",
        capability: "depart",
        durationMinutes: 1,
        requiredForDeparture: false,
        optional: false,
        departure: true,
        powerWatts: 0,
        audible: false,
        dependsOn: steps.length ? [steps.at(-1).id] : [],
      },
      departureMinute,
    ),
  );
  const constraints = [
    ...householdConstraints(profile),
    {
      id: "arrival-derived-deadline",
      type: "DEADLINE",
      atMinute:
        arrivalMinute -
        route.travelMinutes -
        input.extraDelayMinutes -
        input.safetyBufferMinutes,
      conditionalOffset: {
        path: "weather.raining",
        equals: true,
        minutes: -input.rainBufferMinutes,
      },
      severity: "critical",
    },
  ];
  if (input.earliestStartTime)
    constraints.push({
      id: "user-earliest-start",
      type: "EARLIEST_START",
      targetId: "self",
      atMinute: toMinutes(input.earliestStartTime),
      severity: "critical",
    });
  for (const step of steps)
    for (const predecessorId of step.dependsOn)
      constraints.push({
        id: `before-${step.id}`,
        type: "DEPENDENCY",
        predecessorId,
        stepId: step.id,
        severity: "critical",
      });
  const journey = {
    input,
    arrivalAt: new Date(arrivalAt).toISOString(),
    departureAt: new Date(departureAt).toISOString(),
    reminderAt: new Date(reminderAt).toISOString(),
    arrivalTime: input.arrivalTime,
    departureTime: toClock(departureMinute),
    readyTime: toClock(startMinute),
    reminderTime: toClock(reminderMinute),
    routeMinutes: route.travelMinutes,
    trafficMinutesIncluded: route.delayMinutes,
    extraDelayMinutes: input.extraDelayMinutes,
    safetyBufferMinutes: input.safetyBufferMinutes,
    rainBufferMinutes: rainMinutes,
    totalPreparationMinutes: totalPreparation,
  };
  return {
    title: `Arrive by ${input.arrivalTime}`,
    goal: input.goal,
    compiler: "grounded-journey-v1",
    steps,
    constraints,
    context,
    journey,
    householdProfile: profile,
    assumptions: [
      "Preparation tasks run sequentially; no device is controlled.",
      "Safety/rain buffers are your planning policy, not measured weather delays.",
      "Traffic is already included in route duration; no double counting.",
      "One journey, one local day and timezone. Future traffic is an estimate.",
      "Calendar export must be imported; no background reminder is scheduled here.",
    ],
    extractedTasks: steps.map((step) => ({
      request: step.label,
      stepIds: [step.id],
    })),
    explanation: `Leave at ${journey.departureTime}: ${route.travelMinutes} min route + ${input.extraDelayMinutes} min extra contingency + ${input.safetyBufferMinutes} min safety + ${rainMinutes} min rain allowance. Start getting ready at ${journey.readyTime}.`,
  };
}

export function calendarReminder(proposal, now = Date.now()) {
  const journey = proposal.routine.journey;
  if (
    !journey ||
    !["VERIFIED", "AWAITING_APPROVAL", "ACTIVE"].includes(proposal.status)
  )
    throw new AppError(
      "VERIFIED_JOURNEY_REQUIRED",
      "Verify a journey before exporting its reminder.",
      { status: 409 },
    );
  if (Date.parse(journey.reminderAt) <= now)
    throw new AppError(
      "REMINDER_PAST",
      "This reminder time has passed. Plan again.",
      { status: 409 },
    );
  const date = (value) =>
    new Date(value)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const escape = (value) =>
    String(value)
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\r|\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rehearse//Journey planner//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${proposal.id}-v${proposal.version}@rehearse.local`,
    `DTSTAMP:${date(now)}`,
    `DTSTART:${date(journey.reminderAt)}`,
    `DTEND:${date(Date.parse(journey.reminderAt) + 60000)}`,
    `SUMMARY:${escape(`Get ready: ${proposal.routine.title}`)}`,
    `DESCRIPTION:${escape(`${proposal.routine.explanation} Arrival: ${journey.input.date} ${journey.arrivalTime} ${journey.input.timezone}. Estimate only; recheck before travel. This calendar item will not auto-update.`)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:PT0S",
    "DESCRIPTION:Get ready for your journey",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // Fold by UTF-8 octets, not JS characters (RFC 5545).
  const folded = lines.map((line) => {
    let out = "",
      bytes = 0;
    for (const char of line) {
      const size = Buffer.byteLength(char);
      if (bytes + size > 74) {
        out += "\r\n ";
        bytes = 1;
      }
      out += char;
      bytes += size;
    }
    return out;
  });
  return {
    filename: "rehearse-reminder.ics",
    mimeType: "text/calendar;charset=utf-8",
    content: folded.join("\r\n") + "\r\n",
    message:
      "Import this file into your calendar and check that alerts are enabled. It is a snapshot, not an Alexa reminder or an automatically updated event.",
  };
}
