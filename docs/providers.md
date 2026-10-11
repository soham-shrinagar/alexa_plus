# Gemini and external-provider setup

## Required for the real LLM experience

Create or rotate a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey). Put it in `apps/mcp-server/.env`, never in public JavaScript, Git, screenshots, or Markdown:

```dotenv
GEMINI_API_KEY=<your-rotated-key>
GEMINI_MODEL=gemini-3.5-flash-lite
LLM_TIMEOUT_MS=45000
```

The supplied local key authenticated and a real planning request succeeded on 2026-10-11. It was pasted into chat, so rotate it before publishing/deploying. Model access and quota depend on the account; use a model supported by your key. The model ID is configurable, not silently downgraded. See Google's [model catalog](https://ai.google.dev/gemini-api/docs/models) and [API documentation](https://ai.google.dev/api/generate-content).

Restart Node after changing environment values. `/health` exposes configuration booleans/model ID, not credentials. A configured key does not prove available quota.

Gemini receives the request, selected household profile, policy snapshot, environment evidence, and the actual registered MCP tool catalog. Use synthetic data. Structured responses undergo Zod and semantic validation: known entities/capabilities, task-to-step mappings, acyclic dependencies, power from the profile, declared minimum durations, and bounded times. A valid response is a candidate, not proof of correct intent interpretation or safety.

`assistant.respond` selects one allowlisted operation. It cannot activate, roll back, inject events, or change household configuration. The browser opens an explicit approval dialog before activation. No prompt can substitute for that click.

## Weather: implemented, no key needed

The Open-Meteo adapter calls its hourly forecast endpoint using household latitude/longitude, local date, and hour. It returns precipitation, temperature, weather code, timezone, retrieval timestamp, forecast-valid time, attribution, and cache status. Rain means forecast precipitation greater than zero; this is an estimate, not a guarantee.

The built-in profiles contain example Pune city-center coordinates, not your actual home. Change coordinates in an exported/custom household profile. Do not assume these examples represent your location. Leave the date blank for the provider's current local day, or choose a date within the seven-day forecast; select a relevant hour.

Open-Meteo permits keyless non-commercial use with attribution and request limits; commercial use needs a suitable plan or self-hosting. Review its [docs](https://open-meteo.com/en/docs), [terms](https://open-meteo.com/en/terms), and [pricing](https://open-meteo.com/en/pricing) for your usage.

Responses are cached for five minutes, with original retrieval timestamps preserved. Approval refuses live evidence older than 15 minutes. Refresh context to increment the proposal version, reverify, and invalidate old approvals. Errors/missing values fail closed: the adapter never labels made-up weather as live.

## Traffic: implemented adapter, optional key still required

Weather alone satisfies the real-provider requirement. Traffic is an optional enhancement, not a blocker.

1. Create a TomTom developer account/project through its [developer portal](https://developer.tomtom.com/).
2. Enable access to the Routing API and obtain an API key.
3. Review the current free allocation, terms, and billing controls. The [pricing page](https://docs.tomtom.com/pricing) lists free monthly Routing requests; do not assume an older daily quota.
4. Put `TOMTOM_API_KEY=<your-key>` in the server environment.
5. Add `route.origin` and `route.destination` coordinates to a custom household profile.
6. Restart, select that profile, and enable “Include optional TomTom traffic”.

The adapter uses [Calculate Route](https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route) with traffic enabled and departure “now”. It normalizes current route duration, distance, and free-flow-relative traffic delay. It does NOT claim future commute forecasts, an arrival-time guarantee, or a continuously running monitor. Delays above the supported 60-minute range require manual review.

No TomTom key was supplied, so live TomTom calls have not been verified. Request construction, response validation, missing-key behavior, and redaction are covered by mocked tests.

## Provider modes and failure handling

- `live`: real weather; optionally real traffic. Missing configuration or provider failure stops planning/refresh.
- `fixture`: explicit synthetic environment for repeatable demonstrations.
- `none`: explicit no-provider assumptions (dry weather, zero reported travel delay).
- `mode=fixture`: legacy bounded school planner, no Gemini or provider call.
- `mode=gemini`: general LLM planner; can combine with live or explicitly synthetic environment.

Gemini auth/quota/network errors are sanitized and actionable. Calls have timeouts and response-size limits, fixed endpoint allowlists, and no secret-bearing error bodies. There is no automatic fallback that pretends the fixture was an LLM result. Provider calls occur outside database transactions.

The Gemini adapter additionally limits itself to three concurrent requests and twelve starts per minute per server process. This is a local abuse/cost guard, not an account billing cap or distributed limiter. A conversational plan can use two requests (operation selection plus extraction); wait a minute on LLM_BUSY.

## Verification

```powershell
npm test
npm run check
npm run prisma:validate
npm run smoke:providers
```

The last command is opt-in: it makes real Gemini/weather requests, may consume quota, and exercises MCP initialize/list/call on a temporary memory-backed server. It does not write to Neon or activate devices.

Stop any running server before `npm ci` or Prisma generation: a running Windows Prisma client locks its engine DLL. Use either Windows dependencies in this checkout, or a separate WSL/Linux checkout; never share native dependency folders across both.

## Owner inputs still needed

- Rotated Gemini key and acceptable account quota/budget.
- Your example city/coordinates and relevant forecast date/hour (use synthetic locations in public demos).
- Optional TomTom key plus route coordinates, only if traffic is desired.
- Hosting secrets/retention and abuse controls if exposing a public demo.
- Amazon onboarding/access only if separately pursuing real Alexa+ integration.

No weather OAuth client, Google Maps subscription, or new Neon account is required for the current browser simulation.
