import assert from "node:assert/strict";
import test from "node:test";
import { GeminiProvider } from "../src/providers/gemini.js";
import { EnvironmentProvider } from "../src/providers/environment.js";
import { builtInHousehold } from "../src/domain/household.js";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const forecast = { timezone: "Asia/Kolkata", hourly: { time: ["2026-10-11T07:00"], precipitation: [2], temperature_2m: [24], weather_code: [61] } };

test("Open-Meteo performs a real-shaped request, validates coordinates, and labels cached evidence", async () => {
  let calls = 0; let now = Date.parse("2026-10-11T00:00:00Z");
  const environment = new EnvironmentProvider({ now: () => now, fetchImpl: async (url, options) => { calls++; assert.equal(url.hostname, "api.open-meteo.com"); assert.equal(url.searchParams.get("timezone"), "auto"); assert.ok(options.signal); return json(forecast); } });
  const input = { latitude: 18.52, longitude: 73.85, date: "2026-10-11", time: "07:45" };
  const first = await environment.weather(input); assert.equal(first.raining, true); assert.equal(first.source, "live-forecast"); assert.equal(first.cached, false);
  assert.equal((await environment.weather(input)).cached, true); assert.equal(calls, 1);
  now += 300001; await environment.weather(input); assert.equal(calls, 2);
  await assert.rejects(() => environment.weather({ latitude: 999, longitude: 0 }), error => error.code === "INVALID_LOCATION");
});
test("provider failure, empty values, missing hour, and malformed JSON never invent weather", async () => {
  for (const response of [() => json({},503), () => json({ hourly: { ...forecast.hourly, precipitation: [null] } }), () => json({hourly:{time:[]}}), () => new Response("not-json")]) {
    const environment = new EnvironmentProvider({ fetchImpl: async () => response() });
    await assert.rejects(() => environment.context(builtInHousehold("work-morning"), { dataMode: "live" }));
  }
});
test("weather evidence drives local weekday and rain while fixture/none are explicit", async () => {
  const environment = new EnvironmentProvider({ fetchImpl: async () => json(forecast) });
  const profile = builtInHousehold("work-morning");
  const context = await environment.context(profile, { dataMode: "live" });
  assert.equal(context.weekday, "Sunday"); assert.equal(context.weather.raining, true); assert.equal(context.evidence[0].provider, "Open-Meteo");
  assert.equal((await environment.context(profile, { dataMode: "fixture" })).evidence.length, 0);
  await assert.rejects(() => environment.context({ ...profile, location: undefined }, { dataMode: "live" }), error => error.code === "LOCATION_REQUIRED");
});
test("TomTom is optional, normalizes current live delay, and does not expose keys", async () => {
  const route = { origin: { latitude: 18.52, longitude: 73.85 }, destination: { latitude: 18.55, longitude: 73.9 } };
  await assert.rejects(() => new EnvironmentProvider().traffic(route), error => error.code === "TRAFFIC_NOT_CONFIGURED");
  const environment = new EnvironmentProvider({ trafficApiKey: "test-secret", fetchImpl: async url => { assert.equal(url.searchParams.get("traffic"),"true"); assert.equal(url.searchParams.get("departAt"),"now"); return json({ routes: [{ summary: { travelTimeInSeconds: 900, trafficDelayInSeconds: 121, lengthInMeters: 4500 } }] }); } });
  const result = await environment.traffic(route); assert.equal(result.delayMinutes,3); assert.equal(result.travelMinutes,15); assert.ok(!JSON.stringify(result).includes("test-secret"));
});
test("Gemini key uses header only and errors remain redacted", async () => {
  const provider = new GeminiProvider({ apiKey:"secret-test", fetchImpl: async (url, options) => { assert.ok(!url.includes("secret-test")); assert.equal(options.headers["x-goog-api-key"],"secret-test"); return json({ candidates:[{finishReason:"STOP",content:{parts:[{text:'{"ok":true}'}]}}] }); } });
  assert.deepEqual(await provider.generate({ system:"test", input:{}, schema:{type:"object"} }), {ok:true});
  await assert.rejects(() => new GeminiProvider({ apiKey:"secret-test", fetchImpl: async () => json({error:{message:"secret-test"}},403) }).generate({system:"",input:{},schema:{}}), error => error.code === "PROVIDER_AUTH_FAILED" && !error.message.includes("secret-test"));
  await assert.rejects(() => new GeminiProvider().generate({system:"",input:{},schema:{}}), error => error.code === "LLM_NOT_CONFIGURED");
});
test("Gemini limits per-process concurrency and rejects truncated responses", async () => {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const provider = new GeminiProvider({apiKey:"test",fetchImpl:async()=>{await waiting; return json({candidates:[{finishReason:"MAX_TOKENS"}]});}});
  const requests = [0,1,2].map(()=>provider.generate({system:"",input:{},schema:{}}));
  await assert.rejects(()=>provider.generate({system:"",input:{},schema:{}}),error=>error.code === "LLM_BUSY");
  release(); const results = await Promise.allSettled(requests);
  assert.ok(results.every(result=>result.status === "rejected" && result.reason.code === "LLM_INCOMPLETE"));
  assert.equal(provider.activeRequests,0);
});
