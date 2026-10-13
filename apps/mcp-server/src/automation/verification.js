import { z } from "zod";
import { stringify } from "yaml";
import {
  entityId,
  hash,
  projectSchema,
  scenarioSchema,
  validateScenario,
} from "./schema.js";
import { simulate, causalTrace } from "./engine.js";
import { toHaRules } from "./importYaml.js";

export const suiteSchema = z
  .array(
    z
      .object({
        scenario: scenarioSchema,
        expected: z
          .record(entityId, z.enum(["on", "off"]))
          .refine(
            (v) => Object.keys(v).length > 0,
            "Each regression needs an independent final-state assertion",
          ),
      })
      .strict(),
  )
  .min(1)
  .max(12)
  .refine(
    (suite) => new Set(suite.map((c) => c.scenario.id)).size === suite.length,
    "Scenario IDs must be unique",
  );

export function dependencyGraph(raw) {
  const project = projectSchema.parse(raw);
  const nodes = project.rules.map((rule) => ({
    id: rule.id,
    reads: [
      ...new Set([
        ...rule.triggers
          .filter((t) => t.kind === "state")
          .map((t) => t.entityId),
        ...rule.conditions.map((c) => c.entityId),
        ...rule.actions
          .filter((a) => a.kind === "condition")
          .map((a) => a.condition.entityId),
      ]),
    ],
    writes: [
      ...new Set(
        rule.actions
          .filter((a) => a.kind === "set")
          .flatMap((a) => a.entityIds),
      ),
    ],
  }));
  const edges = [];
  for (const from of nodes)
    for (const to of nodes)
      for (const entityId of from.writes)
        if (to.reads.includes(entityId))
          edges.push({
            from: from.id,
            to: to.id,
            entityId,
            meaning: "potential_dependency_not_proven_conflict",
          });
  return { nodes, edges };
}

export function verifySuite(rawProject, rawSuite) {
  const project = projectSchema.parse(rawProject),
    suite = suiteSchema.parse(rawSuite);
  const exercised = new Set();
  const results = suite.map(({ scenario, expected }) => {
    for (const key of Object.keys(expected))
      if (!Object.hasOwn(project.entities, key))
        throw new Error(`Unknown regression target: ${key}`);
    const run = simulate(project, scenario);
    run.coverage.exercisedExpectations.forEach((id) => exercised.add(id));
    const assertions = Object.entries(expected).map(([entityId, state]) => ({
      entityId,
      expected: state,
      actual: run.states[entityId].state,
      passed: run.states[entityId].state === state,
    }));
    // Conditional expectations can be exercised by another scenario in this SAME suite.
    const uncertainties = run.coverage.uncertainties.filter(
      (x) => !x.startsWith("Expectation not exercised:"),
    );
    return {
      scenarioId: scenario.id,
      status: run.status,
      findings: run.findings,
      assertions,
      uncertainties,
      passed:
        !run.findings.length &&
        !uncertainties.length &&
        assertions.every((a) => a.passed),
    };
  });
  const missingExpectations = project.expectations
    .filter((e) => !exercised.has(e.id))
    .map((e) => e.id);
  return {
    passed:
      results.every((r) => r.passed) &&
      !missingExpectations.length &&
      project.expectations.length > 0,
    results,
    missingExpectations,
    suiteHash: hash(suite),
    claim:
      "All supplied regression assertions and exercised expectations in this finite suite only.",
  };
}

/** Vary event timing at literal delay boundaries; two documented tie orders, not all schedules. */
export function search(rawProject, rawScenarios, { limit = 32 } = {}) {
  const project = projectSchema.parse(rawProject);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 64 ||
    !Array.isArray(rawScenarios) ||
    rawScenarios.length < 1 ||
    rawScenarios.length > 12
  )
    throw new Error("Search accepts 1..12 seed scenarios and a limit of 1..64");
  const scenarios = rawScenarios.map((s) => validateScenario(project, s));
  const queue = [...scenarios];
  const boundaries = [
    ...new Set(
      project.rules.flatMap((r) => {
        let at = 0;
        return r.actions
          .filter((a) => a.kind === "delay")
          .map((a) => (at += a.milliseconds));
      }),
    ),
  ];
  for (const scenario of scenarios) {
    // The first input anchors the user-supplied experiment; perturb subsequent disruptions.
    for (let i = 1; i < scenario.events.length && queue.length < 256; i++) {
      const points = new Set([
        scenario.events[i].at - 1,
        scenario.events[i].at + 1,
        ...boundaries.flatMap((t) => [t - 1, t, t + 1]),
      ]);
      for (const at of points)
        if (at >= 0 && at <= scenario.until) {
          const changed = structuredClone(scenario);
          changed.events[i].at = at;
          queue.push(changed);
        }
    }
  }
  const seen = new Set(),
    results = [];
  let truncated = false;
  for (const scenario of queue)
    for (const reverseTies of [false, true]) {
      const key = hash({ scenario, reverseTies });
      if (seen.has(key)) continue;
      seen.add(key);
      if (results.length === limit) {
        truncated = true;
        continue;
      }
      const run = simulate(project, scenario, { reverseTies, maxSteps: 1500 });
      results.push({
        scenario,
        reverseTies,
        status: run.status,
        findings: run.findings,
        coverage: run.coverage,
      });
    }
  return {
    projectHash: hash(project),
    tested: results.length,
    truncated,
    results,
    counterexamples: results.filter((r) => r.findings.length),
    coverage:
      "First input held fixed; later event times varied around literal delay boundaries; two tie orders. Initial snapshots not varied. Not exhaustive; no probabilities.",
  };
}

export function minimizeCounterexample(
  project,
  scenario,
  expectationId,
  reverseTies = false,
) {
  let reduced = validateScenario(project, scenario),
    attempts = 0;
  const fails = (s) =>
    simulate(project, s, { reverseTies, maxSteps: 1500 }).findings.some(
      (f) => f.expectationId === expectationId,
    );
  if (!fails(reduced))
    throw new Error(
      "The supplied scenario does not reproduce this expectation violation",
    );
  for (let i = reduced.events.length - 1; i >= 0 && attempts < 100; i--) {
    const candidate = structuredClone(reduced);
    candidate.events.splice(i, 1);
    attempts++;
    if (fails(candidate)) reduced = candidate;
  }
  return {
    scenario: reduced,
    attempts,
    method: "Greedy event deletion only; not globally minimal.",
    expectationId,
    reverseTies,
  };
}

export function proposeRepairs(rawProject, rawSuite) {
  const project = projectSchema.parse(rawProject),
    suite = suiteSchema.parse(rawSuite);
  const baseline = verifySuite(project, suite),
    explored = search(
      project,
      suite.map((x) => x.scenario),
    );
  const candidates = [],
    seen = new Set();
  for (const counterexample of explored.counterexamples) {
    const run = simulate(project, counterexample.scenario, {
      reverseTies: counterexample.reverseTies,
      maxSteps: 1500,
    });
    for (const finding of run.findings) {
      const expectation = project.expectations.find(
        (e) => e.id === finding.expectationId,
      );
      const action = causalTrace(run, finding.cause).findLast(
        (row) => row.kind === "action" && row.action.kind === "set",
      );
      // Negating multi-clause intent is not expressible by a single state guard.
      if (!action || expectation.when.length !== 1) continue;
      const condition = {
        entityId: expectation.when[0].entityId,
        state: expectation.when[0].state === "on" ? "off" : "on",
      };
      const edit = {
        kind: "insert_guard",
        ruleId: action.ruleId,
        actionIndex: action.index,
        condition,
      };
      const id = hash(edit).slice(0, 16);
      if (seen.has(id)) continue;
      seen.add(id);
      const proposed = structuredClone(project),
        rule = proposed.rules.find((r) => r.id === action.ruleId);
      if (rule.actions.length >= 40) continue;
      rule.actions.splice(action.index, 0, { kind: "condition", condition });
      const verification = verifySuite(proposed, suite);
      const replayed = explored.results.map((r) =>
        simulate(proposed, r.scenario, {
          reverseTies: r.reverseTies,
          maxSteps: 1500,
        }),
      );
      const remaining = replayed.filter(
        (r) =>
          r.findings.length ||
          r.coverage.uncertainties.some(
            (x) => !x.startsWith("Expectation not exercised:"),
          ),
      ).length;
      candidates.push({
        id,
        edit,
        cost: 1,
        project: proposed,
        projectHash: hash(proposed),
        verification,
        replayed: replayed.length,
        remaining,
        eligible: verification.passed && remaining === 0,
        rationale:
          "Check the declared override immediately before the offending action; retain entry behavior and normal completion.",
        limitations:
          "Guard stops the remaining action sequence. Confirm this matches your intent; unsupported multi-condition intent requires manual editing.",
      });
      if (candidates.length >= 8) break;
    }
    if (candidates.length >= 8) break;
  }
  return {
    baseline,
    projectHash: hash(project),
    suiteHash: hash(suite),
    explored,
    candidates: candidates.sort(
      (a, b) => Number(b.eligible) - Number(a.eligible) || a.cost - b.cost,
    ),
    vocabulary:
      "One inserted literal guard. No rule deletion, entity substitution, expectation relaxation, or claims of optimality.",
  };
}

export function exportRepair(original, candidate, expectedProjectHash) {
  if (hash(projectSchema.parse(original)) !== expectedProjectHash)
    throw new Error("Stale source project; verify again");
  // Do not treat a caller-provided eligible flag as authorization. Service re-derives candidates.
  return {
    before: stringify(toHaRules(original), { version: "1.1" }),
    after: stringify(toHaRules(candidate.project), { version: "1.1" }),
    edit: candidate.edit,
    projectHash: hash(candidate.project),
    format:
      "Normalized supported HA YAML; comments/layout are not preserved. Review before manual installation.",
  };
}
