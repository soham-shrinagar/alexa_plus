import crypto from "node:crypto";
import { z } from "zod";
import { AppError } from "../errors.js";
import { simulateRoutine, effectiveDeadline } from "./constraintEngine.js";
import { adaptRoutine } from "./runtimeEngine.js";
import { repairRoutine } from "./repairEngine.js";
import { buildJourney, journeyInputSchema } from "./journey.js";
import { toClock, toMinutes } from "./time.js";

export const stressSchema = z
  .object({
    extraTravelMinutes: z.number().int().min(0).max(60).default(15),
    raining: z.boolean().optional(),
    unavailableCapability: z.string().min(1).max(80).optional(),
  })
  .strict();
export const choiceSchema = z.enum([
  "EARLIER_PREPARATION",
  "LATER_ARRIVAL",
  "REPAIR_TIMING",
]);
export function runtimeFingerprint(activation) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        id: activation.id,
        status: activation.status,
        state: activation.runtimeState,
      }),
    )
    .digest("hex");
}

// Pure counterfactual engine: never fetches data, edits policies or persists.
// Provider evidence remains intact; scenario assumptions are separately labelled.
export function rehearse(base, sourceContext, rawScenario, now = Date.now()) {
  const scenario = stressSchema.parse(rawScenario);
  const travelDelayMinutes =
    (sourceContext.travelDelayMinutes ?? 0) + scenario.extraTravelMinutes;
  if (travelDelayMinutes > 60)
    throw new AppError(
      "SCENARIO_OUT_OF_RANGE",
      "The total extra delay must be within 60 minutes.",
      { status: 400 },
    );
  if (
    scenario.unavailableCapability &&
    !base.steps.some(
      (step) => step.capability === scenario.unavailableCapability,
    )
  )
    throw new AppError(
      "UNKNOWN_RUNTIME_CAPABILITY",
      "Select a capability used by this plan.",
      { status: 400 },
    );
  const context = {
    ...structuredClone(sourceContext),
    travelDelayMinutes,
    weather: {
      ...sourceContext.weather,
      raining: scenario.raining ?? sourceContext.weather?.raining ?? false,
    },
    unavailableCapabilities: [
      ...new Set([
        ...(sourceContext.unavailableCapabilities ?? []),
        ...(scenario.unavailableCapability
          ? [scenario.unavailableCapability]
          : []),
      ]),
    ],
  };
  const unchanged = simulateRoutine(base, context);
  let adapted = { ...structuredClone(base), context };
  for (const event of [
    { type: "TRAVEL_DELAY", minutes: travelDelayMinutes },
    { type: "WEATHER_CHANGED", raining: context.weather.raining },
    ...(scenario.unavailableCapability
      ? [
          {
            type: "DEVICE_UNAVAILABLE",
            capability: scenario.unavailableCapability,
          },
        ]
      : []),
  ])
    adapted = adaptRoutine(adapted, event, base).routine;
  const mechanical = repairRoutine(adapted);
  const options = base.journey
    ? journeyOptions(base, context, now)
    : [
        {
          id: "REPAIR_TIMING",
          title: "Repair the schedule",
          tradeoff:
            "Move flexible actions while preserving required tasks and every policy.",
          routine: mechanical.routine,
          verification: mechanical.after,
        },
      ];
  return {
    scenario,
    assumptions: {
      extraTravelMinutes: travelDelayMinutes,
      raining: context.weather.raining,
      unavailableCapabilities: context.unavailableCapabilities,
    },
    baseline: simulateRoutine(base),
    unchanged,
    mechanical: mechanical.after,
    options: options.map((option) => ({
      ...option,
      feasible: option.verification?.status === "PASSED",
      changes: option.routine ? changesBetween(base, option.routine) : [],
      blockers: option.verification?.violations ?? [{ message: option.error }],
    })),
    metrics: journeyMetrics(base, context),
    hypothetical: true,
  };
}

function journeyOptions(base, context, now) {
  const j = base.journey;
  const deadline = base.constraints.find((rule) => rule.type === "DEADLINE");
  const delta = Math.max(
    0,
    effectiveDeadline(deadline, base.context) -
      effectiveDeadline(deadline, context),
  );
  const route = base.context.evidence.find(
    (item) => item.provider === "TomTom",
  );
  const weather =
    base.context.evidence.find((item) => item.role === "origin-departure") ??
    base.context.evidence.find((item) => item.provider === "Open-Meteo");
  // Keep the original forecast and buffers. A simulated rain/delay becomes an
  // explicitly accepted additional contingency, not a fabricated new forecast.
  const definitions = [
    {
      id: "EARLIER_PREPARATION",
      title: "Keep the arrival deadline",
      tradeoff: `Start preparation ${delta} minutes earlier. Preserve the arrival deadline, durations and buffers.`,
      input: {
        ...j.input,
        extraDelayMinutes: j.input.extraDelayMinutes + delta,
      },
    },
    {
      id: "LATER_ARRIVAL",
      title: "Keep the preparation window",
      tradeoff: `Accept an arrival deadline ${delta} minutes later. This explicitly changes your requested deadline.`,
      input: {
        ...j.input,
        arrivalTime: toClock(toMinutes(j.arrivalTime) + delta),
        extraDelayMinutes: j.input.extraDelayMinutes + delta,
        goal: `${base.goal}\nExplicit alternative: accept arrival by ${toClock(toMinutes(j.arrivalTime) + delta)}.`,
      },
      crossDay: toMinutes(j.arrivalTime) + delta > 1439,
    },
  ];
  return definitions.map((definition) => {
    try {
      if (definition.crossDay)
        throw new Error("The alternative crosses midnight; choose a new plan.");
      const input = journeyInputSchema.parse(definition.input);
      const routine = buildJourney(
        input,
        base.householdProfile,
        route,
        { ...weather, raining: base.context.weather.raining },
        now,
      );
      routine.context.evidence = structuredClone(base.context.evidence);
      routine.context.unavailableCapabilities = [
        ...context.unavailableCapabilities,
      ];
      routine.context.acceptedContingency = {
        source: "explicit-rehearsal-choice",
        additionalMinutes: delta,
        assumption:
          "Planning allowance for the chosen disruption; original provider evidence is unchanged.",
      };
      routine.recommendedTools = [
        "simulation.run",
        "routine.request_activation",
      ];
      return {
        id: definition.id,
        title: definition.title,
        tradeoff: definition.tradeoff,
        routine,
        verification: simulateRoutine(routine),
      };
    } catch (error) {
      return {
        id: definition.id,
        title: definition.title,
        tradeoff: definition.tradeoff,
        routine: null,
        verification: null,
        error:
          error instanceof AppError
            ? error.message
            : "This option exceeds the supported day, time or contingency range.",
      };
    }
  });
}
function journeyMetrics(base, context) {
  if (!base.journey) return null;
  const journey = base.journey;
  const departure = base.steps.find((step) => step.departure);
  const reserve = context.weather.raining ? journey.input.rainBufferMinutes : 0;
  const estimatedArrivalMinute =
    departure.startMinute +
    journey.routeMinutes +
    journey.input.extraDelayMinutes +
    context.travelDelayMinutes +
    reserve;
  return {
    arrivalDeadline: journey.arrivalTime,
    scenarioArrival: toClock(estimatedArrivalMinute),
    minutesPastArrival: Math.max(
      0,
      estimatedArrivalMinute - toMinutes(journey.arrivalTime),
    ),
    arrivalMarginMinutes:
      toMinutes(journey.arrivalTime) - estimatedArrivalMinute,
    reservePolicyMinutes: journey.safetyBufferMinutes,
    readinessGapMinutes: Math.max(
      0,
      Math.max(
        ...base.steps
          .filter((step) => step.requiredForDeparture)
          .map((step) => step.endMinute),
        0,
      ) -
        effectiveDeadline(
          base.constraints.find((rule) => rule.type === "DEADLINE"),
          context,
        ),
    ),
    note: "Planning estimate includes the selected weather allowance and hypothetical delay. It is not observed arrival or a traffic guarantee.",
  };
}
export function changesBetween(before, after) {
  return before.steps.flatMap((step) => {
    const next = after.steps.find((item) => item.id === step.id);
    if (!next)
      return [
        {
          stepId: step.id,
          label: step.label,
          from: step.startTime,
          to: "Skipped",
          optional: step.optional,
        },
      ];
    return next.startMinute === step.startMinute
      ? []
      : [
          {
            stepId: step.id,
            label: step.label,
            from: step.startTime,
            to: next.startTime,
          },
        ];
  });
}
