import { AppError } from "../errors.js";

export const EVIDENCE_MAX_AGE_MS = 15 * 60_000;
export const EVIDENCE_NEAR_LIMIT_MS = 10 * 60_000;
export const EVIDENCE_FUTURE_TOLERANCE_MS = 60_000;
export const LIMITED_MARGIN_MINUTES = 5;

// An assessment, not another provider or verifier. Never changes timestamps.
export function assessEvidence(routine, context=routine.context, now=Date.now(), verificationStatus=null) {
  const live=context.dataMode==="live";
  const items=(context.evidence??[]).map(fact=>{
    const at=Date.parse(fact.retrievedAt);const ageMs=Number.isFinite(at)?now-at:null;
    const freshnessStatus=ageMs===null?"MISSING_TIMESTAMP":ageMs < -EVIDENCE_FUTURE_TOLERANCE_MS?"INVALID_TIMESTAMP":ageMs>EVIDENCE_MAX_AGE_MS?"STALE":ageMs>=EVIDENCE_NEAR_LIMIT_MS?"NEAR_LIMIT":"FRESH";
    return {type:fact.provider==="TomTom"?"ROUTE":fact.provider==="Open-Meteo"?"FORECAST":"OTHER",source:fact.provider,role:fact.role??null,retrievedAt:fact.retrievedAt??null,validFor:fact.validFor??fact.requestedArrival??null,ageMs,freshnessStatus,cached:fact.cached===true,attribution:fact.attribution??null};
  });
  const missing=[];const warnings=[];
  if(live){
    if(!items.length)missing.push("Live provider evidence");
    const route=context.evidence?.find(fact=>fact.provider==="TomTom");
    const forecast=context.evidence?.find(fact=>fact.provider==="Open-Meteo"&&fact.role==="origin-departure")??context.evidence?.find(fact=>fact.provider==="Open-Meteo");
    if((routine.journey||context.includeTraffic)&&(!route||!Number.isFinite(route.travelMinutes)||route.travelMinutes<=0))missing.push("Usable TomTom route estimate");
    if(!forecast||typeof forecast.raining!=="boolean"||typeof forecast.timezone!=="string"||typeof forecast.validFor!=="string")missing.push("Dated Open-Meteo forecast and timezone");
    if(routine.journey){
      for(const name of ["origin","destination"]){const place=routine.journey.input[name];if(!place?.label||!Number.isFinite(place.latitude)||!Number.isFinite(place.longitude))missing.push(`Explicit ${name} coordinates`);}
      if(forecast?.validFor&&forecast.validFor.slice(0,10)!==routine.journey.input.date)missing.push("Forecast for the planned local date");
      if(forecast?.validFor&&forecast.validFor.slice(11,13)!==routine.journey.departureTime.slice(0,2))warnings.push({code:"FORECAST_WINDOW_CHANGED",message:"The stored origin forecast was sampled for a different departure hour. This branch has not fetched a new observation; refresh explicitly if you need a new sample."});
      if(route&&!route.requestedArrival)warnings.push({code:"ROUTE_TIME_NOT_RECORDED",message:"The route does not record its intended arrival instant. Review relevance; this is not guaranteed future traffic."});
    }
  }
  const invalid=items.filter(item=>["STALE","MISSING_TIMESTAMP","INVALID_TIMESTAMP"].includes(item.freshnessStatus));
  if(live&&invalid.length)warnings.push({code:"CURRENT_EVIDENCE_REQUIRED",message:"A current, valid provider observation is required before approval. Rehearsing does not refresh evidence."});
  if(items.some(item=>item.freshnessStatus==="NEAR_LIMIT"))warnings.push({code:"EVIDENCE_NEAR_LIMIT",message:"Evidence is approaching the 15-minute freshness limit; recheck before approval."});
  if(missing.length)warnings.push({code:"EVIDENCE_INCOMPLETE",message:`Missing or incomplete: ${missing.join("; ")}.`});
  if(context.dataMode==="fixture")warnings.push({code:"SIMULATED_EVIDENCE",message:"Offline fixture conditions are simulated. Only virtual execution can be approved here."});
  else if(!live)warnings.push({code:"DECLARED_CONTEXT",message:"Verification uses declared context, not observed household state. No live provider was required."});
  const reserve=routine.journey?.safetyBufferMinutes??null;
  if(reserve!==null&&reserve<=LIMITED_MARGIN_MINUTES)warnings.push({code:"LIMITED_ARRIVAL_MARGIN",message:`Only ${reserve} minutes of planned safety margin are reserved. Constraint verification does not calibrate arrival uncertainty.`});
  if(routine.journey)warnings.push({code:"ESTIMATE_NOT_GUARANTEE",message:"Future travel and weather are estimates. Scenario coverage is not an arrival probability."});
  const assumptions=[...(routine.assumptions??[]),...(context.acceptedContingency?[context.acceptedContingency.assumption]:[])];
  return {verificationStatus,sourceMode:live?"LIVE_SNAPSHOT":context.dataMode==="fixture"?"SIMULATED_FIXTURE":"DECLARED_CONTEXT",freshnessStatus:!live?"NOT_APPLICABLE":invalid.length?"STALE_OR_INVALID":!items.length?"MISSING":items.some(item=>item.freshnessStatus==="NEAR_LIMIT")?"NEAR_LIMIT":"FRESH",completenessStatus:missing.length?"INCOMPLETE":live?"COMPLETE_MINIMUM_INPUTS":"DECLARED_ONLY",items,missingInputs:missing,assumptions,locationResolution:routine.journey?"EXPLICIT_CALLER_COORDINATES_NOT_INDEPENDENT_ADDRESS_CONFIRMATION":null,plannedSafetyMarginMinutes:reserve,uncertainty:routine.journey?"UNCALIBRATED_PROVIDER_ESTIMATES":"NOT_QUANTIFIED",approvalEvidenceSatisfied:!live||(!missing.length&&items.length>0&&!invalid.length),freshnessLimitMs:EVIDENCE_MAX_AGE_MS,warnings};
}
export function assertApprovalEvidence(routine, context=routine.context, now=Date.now()) {
  const assessment=assessEvidence(routine,context,now);
  if(!assessment.approvalEvidenceSatisfied){
    if(!["FRESH","NEAR_LIMIT"].includes(assessment.freshnessStatus))throw new AppError("ENVIRONMENT_STALE","Live evidence is missing, invalid or older than 15 minutes. Refresh explicitly and reverify before approval.",{status:409});
    throw new AppError("EVIDENCE_INCOMPLETE","Required provider evidence or supplied inputs are incomplete. Refresh or clarify before approval.",{status:409});
  }
  return assessment;
}
