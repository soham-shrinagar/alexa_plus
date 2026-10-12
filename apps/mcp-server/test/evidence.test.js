import test from "node:test";
import assert from "node:assert/strict";
import { assessEvidence,assertApprovalEvidence,EVIDENCE_MAX_AGE_MS } from "../src/domain/evidenceAssessment.js";
import { buildJourney,journeyInputSchema } from "../src/domain/journey.js";
import { builtInHousehold } from "../src/domain/household.js";
import { simulateRoutine } from "../src/domain/constraintEngine.js";
import { rehearse } from "../src/domain/rehearsalEngine.js";

const now=Date.parse("2030-01-14T00:00:00Z");
function plan(changes={}){
  const point={label:"Public point",latitude:1,longitude:2};
  const input=journeyInputSchema.parse({goal:"Arrive by ten",origin:point,destination:point,date:"2030-01-15",arrivalTime:"10:00",timezone:"UTC",...changes});
  return buildJourney(input,builtInHousehold("personal-day"),{provider:"TomTom",travelMinutes:30,delayMinutes:5,requestedArrival:"2030-01-15T10:00:00Z",retrievedAt:new Date(now).toISOString()},{provider:"Open-Meteo",timezone:"UTC",raining:false,validFor:"2030-01-15T09:00",retrievedAt:new Date(now).toISOString()},now);
}
test("freshness boundaries reuse approval limit; invalid timestamps and incomplete evidence cannot authorize",()=>{
  const p=plan();const original=JSON.stringify(p.context.evidence);
  assert.equal(assessEvidence(p,p.context,now).freshnessStatus,"FRESH");
  assert.equal(assessEvidence(p,p.context,now+600000).freshnessStatus,"NEAR_LIMIT");
  assert.equal(assertApprovalEvidence(p,p.context,now+EVIDENCE_MAX_AGE_MS).approvalEvidenceSatisfied,true);
  assert.throws(()=>assertApprovalEvidence(p,p.context,now+EVIDENCE_MAX_AGE_MS+1),{code:"ENVIRONMENT_STALE"});
  const future=structuredClone(p);future.context.evidence[0].retrievedAt=new Date(now+60001).toISOString();assert.throws(()=>assertApprovalEvidence(future,future.context,now),{code:"ENVIRONMENT_STALE"});
  const missing=structuredClone(p);missing.context.evidence=missing.context.evidence.filter(fact=>fact.provider!=="TomTom");assert.throws(()=>assertApprovalEvidence(missing,missing.context,now),{code:"EVIDENCE_INCOMPLETE"});
  assert.equal(JSON.stringify(p.context.evidence),original);
});
test("verification, evidence completeness, freshness and uncertainty are separate",()=>{
  const p=plan({earliestStartTime:"11:00",safetyBufferMinutes:5});const verification=simulateRoutine(p);
  const assessment=assessEvidence(p,p.context,now,verification.status);
  assert.equal(assessment.verificationStatus,"FAILED");assert.equal(assessment.freshnessStatus,"FRESH");assert.equal(assessment.approvalEvidenceSatisfied,true);
  assert.equal(assessment.uncertainty,"UNCALIBRATED_PROVIDER_ESTIMATES");
  assert.ok(assessment.warnings.some(warning=>warning.code==="LIMITED_ARRIVAL_MARGIN"));
  assert.ok(!JSON.stringify(assessment).includes("confidencePercent"));
});
test("rehearsal keeps evidence age and warns when an alternative moves beyond its sampled forecast hour",()=>{
  const p=plan();const result=rehearse(p,p.context,{events:[{type:"TRAVEL_DELAY",minutes:30}]},now+700000);
  assert.equal(result.evidenceAssessment.freshnessStatus,"NEAR_LIMIT");
  const alternative=result.options[0].routine;
  const assessment=assessEvidence(alternative,alternative.context,now+700000);
  assert.ok(assessment.warnings.some(warning=>warning.code==="FORECAST_WINDOW_CHANGED"));
  assert.deepEqual(alternative.context.evidence,p.context.evidence);
  assert.throws(()=>assertApprovalEvidence(alternative,alternative.context,now+900001),{code:"ENVIRONMENT_STALE"});
});
test("fixtures and declared context are explicit rather than fake live evidence",()=>{
  const p=plan();const context={...p.context,dataMode:"fixture",evidence:[]};
  const assessment=assessEvidence(p,context,now);
  assert.equal(assessment.sourceMode,"SIMULATED_FIXTURE");assert.equal(assessment.freshnessStatus,"NOT_APPLICABLE");
  assert.ok(assessment.warnings.some(item=>item.code==="SIMULATED_EVIDENCE"));
});
