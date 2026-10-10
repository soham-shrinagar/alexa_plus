import { AppError } from "../errors.js";
import { toMinutes } from "./time.js";

const CLOCK = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i;

export function parseRoutineGoal(goal, defaults) {
  const text = goal.trim();
  const leaveMatch = text.match(new RegExp(`(?:leave|depart)[^0-9]{0,20}${CLOCK.source}`, "i"));
  const babyMatch = text.match(new RegExp(`(?:baby|quiet)[^0-9]{0,24}${CLOCK.source}`, "i"));
  const rainMatch = text.match(/(\d+)\s*minutes?\s*(?:earlier|early)[^.!?]*(?:rain|raining)|(?:rain|raining)[^.!?]*(\d+)\s*minutes?\s*(?:earlier|early)/i);
  const rainAdvanceMinutes = Number(rainMatch?.[1] ?? rainMatch?.[2] ?? defaults.rainyDepartureAdvanceMinutes);
  if (rainAdvanceMinutes < 0 || rainAdvanceMinutes > 120) throw new AppError("INVALID_GOAL", "The rainy departure buffer must be between 0 and 120 minutes.", { status: 400 });
  return {
    originalText: text,
    departureMinute: leaveMatch ? clockMatchToMinutes(leaveMatch.slice(1, 4)) : toMinutes(defaults.departureTime),
    quietUntilMinute: babyMatch ? clockMatchToMinutes(babyMatch.slice(1, 4)) : toMinutes(defaults.quietUntil),
    rainAdvanceMinutes,
    avoidPowerOverlap: /(?:kettle).*(?:water heater)|(?:water heater).*(?:kettle)/i.test(text),
    maxConcurrentPowerWatts: defaults.maxConcurrentPowerWatts,
    parser: "bounded-rule-parser-v1",
    assumptions: [
      "The demo forecast is rainy.",
      "Maya needs 35 minutes to get ready.",
      "Only relevant household entities are included in the temporary model."
    ]
  };
}

function clockMatchToMinutes([hoursValue, minutesValue, meridiem]) {
  let hours = Number(hoursValue);
  const minutes = Number(minutesValue ?? 0);
  if (hours > 23 || minutes > 59 || (meridiem && (hours < 1 || hours > 12))) throw new AppError("INVALID_TIME", "Use a valid clock time, for example 07:45 or 7:45 am.", { status: 400 });
  if (/p/i.test(meridiem ?? "") && hours < 12) hours += 12;
  if (/a/i.test(meridiem ?? "") && hours === 12) hours = 0;
  return hours * 60 + minutes;
}
