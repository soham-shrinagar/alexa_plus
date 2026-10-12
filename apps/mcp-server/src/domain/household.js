import { z } from "zod";
import { AppError } from "../errors.js";
import { schoolMorningScenario } from "./scenarios/schoolMorning.js";

const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const capability = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const minute = z.number().int().min(0).max(1439);
const coordinate = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict();
export const householdSchema = z.object({
  id: identifier, name: z.string().min(1).max(100), description: z.string().max(500).default("User-configured household"),
  people: z.array(z.object({ id: identifier, name: z.string().min(1).max(80), roles: z.array(z.string().max(50)).max(10).default([]), preparationMinutes: z.number().int().min(1).max(240).optional() }).strict()).min(1).max(20),
  devices: z.array(z.object({ id: identifier, name: z.string().min(1).max(80), capabilities: z.array(capability).min(1).max(10), powerWatts: z.number().int().min(0).max(20000), location: z.string().max(100).default("home"), audible: z.boolean().default(false), minimumDurationMinutes: z.number().int().min(1).max(240).default(1) }).strict()).max(40),
  policies: z.object({ maxConcurrentPowerWatts: z.number().int().min(1).max(30000), quietUntilMinute: minute.optional(), earliestStarts: z.array(z.object({ targetId: identifier, atMinute: minute }).strict()).max(20).default([]), rainyDepartureAdvanceMinutes: z.number().int().min(0).max(120).default(15) }).strict(),
  location: coordinate.optional(), route: z.object({ origin: coordinate, destination: coordinate }).strict().optional(),
  environment: z.object({ weekday: z.enum(["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]).default("Friday"), weather: z.object({ raining: z.boolean() }).default({ raining: false }), travelDelayMinutes: z.number().int().min(0).max(60).default(0), unavailableCapabilities: z.array(z.string().max(80)).max(40).default([]) }).strict().default({})
}).strict().superRefine((profile, ctx) => {
  const ids = [...profile.people, ...profile.devices].map((item) => item.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Entity IDs must be unique." });
  if (new Set(profile.policies.earliestStarts.map((item) => item.targetId)).size !== profile.policies.earliestStarts.length) ctx.addIssue({ code: "custom", message: "Only one earliest-start policy per entity is supported." });
  for (const rule of profile.policies.earliestStarts) if (!ids.includes(rule.targetId)) ctx.addIssue({ code: "custom", message: "Earliest-start policy references an unknown entity." });
});

export function validateHousehold(value) {
  const result = householdSchema.safeParse(value);
  if (!result.success) throw new AppError("INVALID_HOUSEHOLD", "Check household IDs, capabilities, coordinates, and policy ranges.", { status: 400 });
  return result.data;
}

const school = validateHousehold({
  id: "school-morning", name: "School morning", description: schoolMorningScenario.description,
  people: schoolMorningScenario.household.people.map(({ id, name, roles, preparationMinutes }) => ({ id, name, roles, ...(preparationMinutes ? { preparationMinutes } : {}) })),
  devices: schoolMorningScenario.household.devices.map((device) => ({ ...device, audible: device.capabilities.includes("announce"), minimumDurationMinutes: Math.max(1, ...schoolMorningScenario.routineTemplate.steps.filter((step) => step.targetId === device.id).map((step) => step.durationMinutes)) })),
  policies: { maxConcurrentPowerWatts: 2600, quietUntilMinute: 420, earliestStarts: [{ targetId: "maya", atMinute: 420 }], rainyDepartureAdvanceMinutes: 15 },
  location: { latitude: 18.5204, longitude: 73.8567 }, environment: schoolMorningScenario.environment
});
const work = validateHousehold({
  id: "work-morning", name: "Work commute", description: "Two adults, shared appliances, and a commute; no school-specific assumptions.",
  people: [{ id: "alex", name: "Alex", roles: ["commuter"], preparationMinutes: 30 }, { id: "sam", name: "Sam", roles: ["remote-worker"], preparationMinutes: 20 }],
  devices: [
    { id: "kettle", name: "Kettle", capabilities: ["boil-water"], powerWatts: 1500, minimumDurationMinutes: 5 },
    { id: "toaster", name: "Toaster", capabilities: ["toast"], powerWatts: 1200, minimumDurationMinutes: 4 },
    { id: "speaker", name: "Kitchen speaker", capabilities: ["announce"], powerWatts: 8, audible: true },
    { id: "porch-light", name: "Porch light", capabilities: ["set-light"], powerWatts: 10 }
  ],
  policies: { maxConcurrentPowerWatts: 2000, quietUntilMinute: 420, earliestStarts: [{ targetId: "alex", atMinute: 420 }], rainyDepartureAdvanceMinutes: 10 },
  location: { latitude: 18.5204, longitude: 73.8567 }, environment: { weekday: "Monday" }
});
const evening = validateHousehold({
  id: "evening-guests", name: "Evening guests", description: "Dinner, cleaning, and quiet hours without a departure step.",
  people: [{ id: "host", name: "Host", roles: ["host"] }, { id: "guest", name: "Guest", roles: ["guest"] }],
  devices: [
    { id: "oven", name: "Oven", capabilities: ["cook"], powerWatts: 2200, minimumDurationMinutes: 30 },
    { id: "dishwasher", name: "Dishwasher", capabilities: ["wash-dishes"], powerWatts: 1800, minimumDurationMinutes: 40 },
    { id: "vacuum", name: "Vacuum", capabilities: ["vacuum"], powerWatts: 800, audible: true, minimumDurationMinutes: 15 },
    { id: "living-light", name: "Living-room light", capabilities: ["set-light"], powerWatts: 20 }
  ],
  policies: { maxConcurrentPowerWatts: 3000, quietUntilMinute: 1080, rainyDepartureAdvanceMinutes: 0 },
  location: { latitude: 18.5204, longitude: 73.8567 }, environment: { weekday: "Saturday" }
});

const personal = validateHousehold({ id: "personal-day", name: "My day", description: "A blank personal planner. No invented family, appliances, address, or school schedule.", people: [{ id: "self", name: "You", roles: ["planner"] }], devices: [], policies: { maxConcurrentPowerWatts: 3000, rainyDepartureAdvanceMinutes: 10 }, environment: {} });
const profiles = [personal, school, work, evening];
export function builtInHouseholds() { return structuredClone(profiles); }
export function builtInHousehold(id) { return structuredClone(profiles.find((profile) => profile.id === id)); }

export function householdConstraints(profile) {
  return [
    { id: "power-budget", type: "MAX_CONCURRENT_POWER", maxWatts: profile.policies.maxConcurrentPowerWatts, severity: "critical" },
    { id: "device-availability", type: "DEVICE_AVAILABLE", severity: "critical" },
    { id: "resource-exclusive", type: "RESOURCE_EXCLUSIVE", severity: "critical" },
    ...(profile.policies.quietUntilMinute === undefined ? [] : [{ id: "quiet-window", type: "QUIET_WINDOW", untilMinute: profile.policies.quietUntilMinute, severity: "critical" }]),
    ...profile.policies.earliestStarts.map((rule) => ({ id: `${rule.targetId}-earliest`, type: "EARLIEST_START", ...rule, severity: "critical" }))
  ];
}
