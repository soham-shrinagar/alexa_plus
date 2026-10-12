import crypto from "node:crypto";
import { z } from "zod";
import { AppError } from "../errors.js";
import { simulateRoutine, effectiveDeadline } from "./constraintEngine.js";
import { adaptRoutine } from "./runtimeEngine.js";
import { repairRoutine } from "./repairEngine.js";
import { buildJourney, journeyInputSchema } from "./journey.js";
import { toClock, toMinutes, withTiming } from "./time.js";
import { assessEvidence } from "./evidenceAssessment.js";

const legacyStressSchema = z
  .object({
    extraTravelMinutes: z.number().int().min(0).max(60).default(15),
    raining: z.boolean().optional(),
    unavailableCapability: z.string().min(1).max(80).optional(),
  })
  .strict();
export const MAX_SCENARIO_EVENTS = 6;
const hypothetical = z.literal(true).default(true);
export const scenarioEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("TRAVEL_DELAY"),
      minutes: z.number().int().min(0).max(60),
      hypothetical,
    })
    .strict(),
  z
    .object({ type: z.literal("RAIN"), raining: z.boolean(), hypothetical })
    .strict(),
  z
    .object({
      type: z.literal("CAPABILITY_UNAVAILABLE"),
      capability: z.string().min(1).max(80),
      hypothetical,
    })
    .strict(),
  z
    .object({
      type: z.literal("TASK_ALLOWANCE"),
      stepId: z.string().min(1).max(80),
      minutes: z.number().int().min(1).max(60),
      hypothetical,
    })
    .strict(),
]);
export const stressSchema = z.union([
  z
    .object({ events: z.array(scenarioEventSchema).max(MAX_SCENARIO_EVENTS) })
    .strict(),
  legacyStressSchema,
]);
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
  const events = scenario.events ?? [
    {
      type: "TRAVEL_DELAY",
      minutes: scenario.extraTravelMinutes,
      hypothetical: true,
    },
    ...(scenario.raining === undefined
      ? []
      : [{ type: "RAIN", raining: scenario.raining, hypothetical: true }]),
    ...(scenario.unavailableCapability
      ? [
          {
            type: "CAPABILITY_UNAVAILABLE",
            capability: scenario.unavailableCapability,
            hypothetical: true,
          },
        ]
      : []),
  ];
  if (base.steps.length > 40 || base.constraints.length > 500)
    throw new AppError(
      "SCENARIO_TOO_LARGE",
      "Rehearsal supports at most 40 tasks and 500 constraints.",
      { status: 422 },
    );
  const keys = events.map(
    (event) => `${event.type}:${event.stepId ?? event.capability ?? "plan"}`,
  );
  if (new Set(keys).size !== keys.length)
    throw new AppError(
      "DUPLICATE_SCENARIO_EVENT",
      "Use one event per condition or task. Travel delay is one additional allowance, not multiple increments.",
      { status: 400 },
    );
  const appliedEvents = [...events].sort((a, b) =>
    eventKey(a).localeCompare(eventKey(b)),
  );
  const extraTravel =
    events.find((event) => event.type === "TRAVEL_DELAY")?.minutes ?? 0;
  const travelDelayMinutes =
    (sourceContext.travelDelayMinutes ?? 0) + extraTravel;
  if (travelDelayMinutes > 60)
    throw new AppError(
      "SCENARIO_OUT_OF_RANGE",
      "The total extra delay must be within 60 minutes.",
      { status: 400 },
    );
  const failures = events.filter(
    (event) => event.type === "CAPABILITY_UNAVAILABLE",
  );
  if (
    failures.some(
      (event) =>
        !base.steps.some((step) => step.capability === event.capability),
    )
  )
    throw new AppError(
      "UNKNOWN_RUNTIME_CAPABILITY",
      "Select a capability used by this plan.",
      { status: 400 },
    );
  const allowances = events.filter((event) => event.type === "TASK_ALLOWANCE");
  if (allowances.reduce((total, event) => total + event.minutes, 0) > 120)
    throw new AppError(
      "SCENARIO_OUT_OF_RANGE",
      "Combined task allowances must be within 120 minutes.",
      { status: 400 },
    );
  for (const event of allowances) {
    const step = base.steps.find((item) => item.id === event.stepId);
    if (
      !step ||
      step.departure ||
      !["manual_task", "prepare_person"].includes(step.capability) ||
      step.durationMinutes + event.minutes > 240
    )
      throw new AppError(
        "UNSUPPORTED_TASK_ALLOWANCE",
        "Select a referenced manual/preparation task whose increased duration stays within 240 minutes.",
        { status: 400 },
      );
  }
  const unsupportedConditions = [];
  if (
    events.some((event) => event.type === "RAIN") &&
    !base.constraints.some(
      (rule) =>
        rule.type === "DEADLINE" &&
        rule.conditionalOffset?.path === "weather.raining",
    )
  )
    unsupportedConditions.push(
      "Rain changes the hypothetical weather flag only: no rain-related scheduling rule is declared for this plan.",
    );
  if (
    extraTravel &&
    !base.constraints.some((rule) => rule.type === "DEADLINE")
  ) {
    if (scenario.events)
      throw new AppError(
        "UNSUPPORTED_SCENARIO",
        "This plan has no departure deadline to which travel delay can apply.",
        { status: 400 },
      );
    unsupportedConditions.push(
      "Legacy travel allowance has no scheduling effect because this plan has no departure deadline.",
    );
  }
  const context = {
    ...structuredClone(sourceContext),
    travelDelayMinutes,
    weather: {
      ...sourceContext.weather,
      raining:
        events.find((event) => event.type === "RAIN")?.raining ??
        sourceContext.weather?.raining ??
        false,
    },
    unavailableCapabilities: [
      ...new Set([
        ...(sourceContext.unavailableCapabilities ?? []),
        ...failures.map((event) => event.capability),
      ]),
    ],
  };
  const affected = { ...structuredClone(base), context };
  affected.steps = affected.steps.map((step) => {
    const allowance = allowances.find((event) => event.stepId === step.id);
    return allowance
      ? withTiming(
          {
            ...step,
            durationMinutes: step.durationMinutes + allowance.minutes,
          },
          step.startMinute,
        )
      : step;
  });
  const unchanged = simulateRoutine(affected, context);
  let adapted = structuredClone(affected);
  for (const event of [
    { type: "TRAVEL_DELAY", minutes: travelDelayMinutes },
    { type: "WEATHER_CHANGED", raining: context.weather.raining },
    ...context.unavailableCapabilities.map((capability) => ({
      type: "DEVICE_UNAVAILABLE",
      capability,
    })),
  ])
    adapted = adaptRoutine(adapted, event, base).routine;
  const mechanical = repairRoutine(adapted);
  const options = base.journey
    ? journeyOptions(base, context, allowances, now)
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
    scenario: scenario.events ? { events: appliedEvents } : scenario,
    appliedEvents,
    unsupportedConditions,
    affectedTasks: base.steps
      .filter(
        (step) =>
          allowances.some((event) => event.stepId === step.id) ||
          failures.some((event) => event.capability === step.capability) ||
          ((extraTravel || events.some((event) => event.type === "RAIN")) &&
            (step.departure || step.requiredForDeparture)),
      )
      .map((step) => ({
        id: step.id,
        label: step.label,
        targetId: step.targetId,
        capability: step.capability,
        originalDurationMinutes: step.durationMinutes,
        scenarioDurationMinutes: affected.steps.find(
          (item) => item.id === step.id,
        ).durationMinutes,
      })),
    assumptions: {
      extraTravelMinutes: travelDelayMinutes,
      raining: context.weather.raining,
      unavailableCapabilities: context.unavailableCapabilities,
      preparationAllowanceMinutes: allowances.reduce(
        (total, event) => total + event.minutes,
        0,
      ),
    },
    baseline: simulateRoutine(base, sourceContext),
    unchanged,
    mechanical: mechanical.after,
    options: options.map((option) => ({
      ...option,
      feasible: option.verification?.status === "PASSED",
      changes: option.routine ? changesBetween(base, option.routine) : [],
      blockers: option.verification?.violations ?? [{ message: option.error }],
      resolution: {
        modeled: Boolean(option.routine),
        verificationStatus: option.verification?.status ?? "UNMODELED",
        resolvesViolationIds: unchanged.violations
          .filter(
            (issue) =>
              option.verification &&
              !option.verification.violations.some(
                (remaining) => remaining.id === issue.id,
              ),
          )
          .map((issue) => issue.id),
        requiresSelection: true,
        requiresApproval: true,
        changesDeadline:
          option.id === "LATER_ARRIVAL" &&
          option.routine?.journey?.arrivalTime !== base.journey?.arrivalTime,
        preservedConstraintIds: base.constraints
          .filter((rule) => rule.id !== "arrival-derived-deadline")
          .map((rule) => rule.id),
      },
      metrics: option.routine
        ? journeyMetrics(option.routine, option.routine.context)
        : null,
      evidenceAssessment:option.routine?assessEvidence(option.routine,option.routine.context,now,option.verification?.status??null):null,
    })),
    metrics: journeyMetrics(affected, context),
    scenarioChanges: changesBetween(base, affected),
    hypothetical: true,
    evidenceAssessment:assessEvidence(base,base.context,now,unchanged.status),
  };
}

function eventKey(event) {
  return `${event.type}:${event.stepId ?? event.capability ?? "plan"}`;
}
function journeyOptions(base, context, allowances, now) {
  const j = base.journey;
  const deadline = base.constraints.find((rule) => rule.type === "DEADLINE");
  const delta = Math.max(
    0,
    effectiveDeadline(deadline, base.context) -
      effectiveDeadline(deadline, context),
  );
  const taskDelta = allowances.reduce(
    (total, event) => total + event.minutes,
    0,
  );
  const preparationShift = delta + taskDelta;
  const changedInput = {
    ...j.input,
    tasks: j.input.tasks.map((task) => ({ ...task })),
  };
  for (const event of allowances) {
    const index = base.steps
      .filter((step) => !step.departure)
      .findIndex((step) => step.id === event.stepId);
    if (j.input.preparationMinutes && index === 0)
      changedInput.preparationMinutes += event.minutes;
    else
      changedInput.tasks[
        index - (j.input.preparationMinutes ? 1 : 0)
      ].durationMinutes += event.minutes;
  }
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
      tradeoff: `Start preparation ${preparationShift} minutes earlier. Preserve the arrival deadline, required tasks and buffers; explicitly include ${taskDelta} minutes of additional preparation allowance.`,
      input: {
        ...changedInput,
        extraDelayMinutes: j.input.extraDelayMinutes + delta,
      },
    },
    {
      id: "LATER_ARRIVAL",
      title: "Keep the preparation window",
      tradeoff: `Accept an arrival deadline ${preparationShift} minutes later. Keep the preparation start, explicitly include ${taskDelta} minutes of task allowance, and preserve buffers.`,
      input: {
        ...changedInput,
        arrivalTime: toClock(toMinutes(j.arrivalTime) + preparationShift),
        extraDelayMinutes: j.input.extraDelayMinutes + delta,
        goal: `${base.goal}\nExplicit alternative: accept arrival by ${toClock(toMinutes(j.arrivalTime) + preparationShift)}.`,
      },
      crossDay: toMinutes(j.arrivalTime) + preparationShift > 1439,
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
      // Retain the policy floor even if an older/custom proposal contains
      // constraints beyond the current compiler's template.
      for (const rule of base.constraints.filter(
        (rule) => rule.id !== "arrival-derived-deadline",
      )) {
        const index = routine.constraints.findIndex(
          (item) => item.id === rule.id,
        );
        if (index < 0) routine.constraints.push(structuredClone(rule));
        else routine.constraints[index] = structuredClone(rule);
      }
      routine.context.unavailableCapabilities = [
        ...context.unavailableCapabilities,
      ];
      routine.context.acceptedContingency = {
        source: "explicit-rehearsal-choice",
        additionalMinutes: delta,
        preparationAllowanceMinutes: taskDelta,
        events: structuredClone(allowances),
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
  const capabilityBlocked = base.steps.some(step=>!step.optional&&(context.unavailableCapabilities??[]).includes(step.capability));
  const estimatedArrivalMinute =
    departure.startMinute +
    journey.routeMinutes +
    journey.input.extraDelayMinutes +
    context.travelDelayMinutes +
    reserve;
  return {
    arrivalDeadline: journey.arrivalTime,
    scenarioArrival: capabilityBlocked ? null : toClock(estimatedArrivalMinute),
    minutesPastArrival: capabilityBlocked ? null : Math.max(
      0,
      estimatedArrivalMinute - toMinutes(journey.arrivalTime),
    ),
    arrivalMarginMinutes: capabilityBlocked ? null : toMinutes(journey.arrivalTime) - estimatedArrivalMinute,
    capabilityBlocked,
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
    return next.startMinute === step.startMinute &&
      next.durationMinutes === step.durationMinutes
      ? []
      : [
          {
            stepId: step.id,
            label: step.label,
            from: step.startTime,
            to: next.startTime,
            originalDurationMinutes: step.durationMinutes,
            durationMinutes: next.durationMinutes,
          },
        ];
  });
}
