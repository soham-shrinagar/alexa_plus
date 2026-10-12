import { z } from "zod";
import { AppError } from "../errors.js";
import { rehearse, stressSchema } from "./rehearsalEngine.js";

export const scenarioSetSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
        label: z.string().min(1).max(80),
        scenario: stressSchema,
      })
      .strict(),
  )
  .min(1)
  .max(8);

// Fixed candidate schedules, not automatic repair per row. A scenario adds
// conditions beyond each candidate's retained commitments and safety buffers.
export function compareScenarioSet(base, context, input, now = Date.now()) {
  const scenarios = scenarioSetSchema.parse(input.scenarios);
  if (new Set(scenarios.map((row) => row.id)).size !== scenarios.length)
    throw new AppError("DUPLICATE_SCENARIO", "Scenario IDs must be unique.", {
      status: 400,
    });
  const started = performance.now();
  const candidates = [
    {
      id: "ORIGINAL",
      title: "Original schedule",
      routine: base,
      context,
      changes: [],
    },
  ];
  if (input.candidateScenario) {
    const seed = rehearse(base, context, input.candidateScenario, now);
    for (const option of seed.options.slice(0, 2))
      if (option.routine)
        candidates.push({ ...option, context: option.routine.context });
  }
  const results = candidates.map((candidate) => {
    const rows = scenarios.map((row) => {
      if (performance.now() - started > 1000)
        throw new AppError(
          "COMPARISON_LIMIT",
          "Comparison exceeded its one-second evaluation budget. Use fewer scenarios.",
          { status: 422 },
        );
      const result = rehearse(
        candidate.routine,
        candidate.context,
        row.scenario,
        now,
      );
      return {
        id: row.id,
        label: row.label,
        scenario: result.scenario,
        verification: result.unchanged,
        metrics: result.metrics,
        changes: result.scenarioChanges,
        evidenceAssessment: result.evidenceAssessment,
      };
    });
    return {
      id: candidate.id,
      title: candidate.title,
      changes: candidate.changes,
      passingScenarios: rows.filter(
        (row) => row.verification.status === "PASSED",
      ).length,
      evaluatedScenarios: rows.length,
      rows,
    };
  });
  if (performance.now() - started > 1000)
    throw new AppError(
      "COMPARISON_LIMIT",
      "Comparison exceeded its evaluation budget.",
      { status: 422 },
    );
  return {
    hypothetical: true,
    evaluatedAt: new Date(now).toISOString(),
    evidence: structuredClone(base.context.evidence ?? []),
    candidates: results,
    limits: {
      scenarios: 8,
      eventsPerScenario: 6,
      candidates: 3,
      evaluationBudgetMs: 1000,
    },
    interpretation:
      "Passing counts are constraint checks, not success probabilities. Each row is an additional shock beyond that candidate's retained allowances. No buffer or hard policy is consumed or relaxed.",
  };
}
