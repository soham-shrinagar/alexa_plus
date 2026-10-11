# Security and privacy

## Authentication and authorization

- MCP uses bearer JWTs validated for issuer, audience, signature algorithm, and expiry.
- Tools require `mcp:tools` and a user identity.
- OAuth metadata is published for discovery.
- Authorization-code flow requires PKCE S256 and registered redirect URIs.
- Client credentials are supported for service clients.
- Production requires HTTPS, authentication, and a JWT secret of at least 32 characters.

## User isolation

Every repository operation scopes by authenticated external user ID. Prisma resolves that identity to an internal user and includes the internal user ID in lookups/updates. Guessing an object UUID is insufficient to access another user’s routine.

An MCP session also belongs to its originating authenticated user and client. A different valid token cannot borrow that session. Database writes are transactional and serialized per user, including approval consumption and audit evidence.

## High-impact actions

- Activation requires a passing latest simulation.
- Approval has an expiry, one-time consumption, action type, and SHA-256 payload hash.
- The payload includes proposal ID and version.
- Activation and rollback require `confirmed: true`.
- A snapshot is recorded before activation.
- Active proposal versions cannot be revised. Unsafe runtime changes suspend the virtual schedule until recovery or rollback.

## Web/demo boundary

`/demo/session` is available only when `DEMO_MODE=true`. Each visit gets a separate synthetic identity and short-lived token. It must never provide access to real household data/devices. Production mode returns 404 for this route; the browser does not include a production login flow.

## HTTP controls

- request body limits;
- request IDs;
- rate limiting;
- origin allowlist;
- same-origin validation and host checks including loopback demo mode;
- `nosniff`, no-referrer, and no-store headers;
- bounded MCP session count and TTL;
- safe error responses.
- bearer protection for metrics and authentication challenges with resource metadata.

## Data minimization

The micro-twin selects only referenced people and devices. Audit events contain structured lifecycle facts, not access tokens. Routine goals may contain household information and should be treated as private data in a real deployment.

Demo records accumulate in Prisma because visits create new identities; use synthetic inputs and define retention before exposing a public demo. Application audit events are append-only, but are not cryptographically chained or protected from a database administrator.

## LLM and external-provider boundaries

Gemini credentials stay server-side in an ignored environment file; no key is returned in tools, health, UI, or error bodies. Treat a key pasted into chat as exposed and rotate it. Requests and the selected household/policy/evidence snapshot are sent to Gemini. Coordinates go to Open-Meteo and, only when enabled, TomTom. Use synthetic names/locations in public demonstrations and review provider data terms before sending real household details.

The model receives the actual registered tool catalog but can execute only an application-owned allowlist through `assistant.respond`: plan, simulate, repair, revise, status, or request approval. It cannot activate, roll back, inject events, or save household policies. Requesting approval is not granting it. MCP callers are still responsible for truthful human confirmation; tool annotations are hints, not authorization.

Zod and semantic validation reject malformed/unknown plans, task mapping failures, short declared durations, and dependency cycles. Power/noise and household safety floors come from declared profiles, not model output. Repairs cannot relax those floors. Earlier-person exceptions require explicit named clock-time permission with matching weekday scope. Gemini may still misinterpret intent: task review and verification are necessary, not a proof of universal safety.

Provider endpoints are fixed, redirects rejected, responses size-limited, and calls time-bounded. Failures never substitute invented live evidence. A five-minute weather/traffic cache keeps original timestamps; evidence older than 15 minutes cannot authorize activation. Refresh increments proposal version. Network calls are outside DB transactions, with version checks before applying edits.

Built-in household IDs are reserved; custom profiles are per-user and explicitly confirmed. Existing snapshots cannot be silently changed by later household edits. Production needs account-level cost limits, stronger distributed abuse controls, LLM threat evaluation, retention/deletion policies, and hardware interlocks before any physical executor.

## Production deployment work

Before real household deployment, add a real identity provider, consent and deletion controls, encrypted secret management, vendor-specific device authorization, device-state verification, a shared MCP session store for multi-instance hosting, log redaction/retention policy, threat modeling, abuse testing, and independent security review.

Four high-severity npm findings currently affect the Prisma CLI dependency chain. Review a compatible upgrade and retest migration/client behavior before production; do not force npm's suggested downgrade.
