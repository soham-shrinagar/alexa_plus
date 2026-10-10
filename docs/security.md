# Security and privacy

## Authentication and authorization

- MCP uses bearer JWTs validated for issuer, audience, signature algorithm, and expiry.
- Tools require `mcp:tools` and a user identity.
- OAuth metadata is published for discovery.
- Authorization-code flow requires PKCE S256 and registered redirect URIs.
- Client credentials are supported for service clients.
- Production requires a configured JWT secret.

## User isolation

Every repository operation scopes by authenticated external user ID. Prisma resolves that identity to an internal user and includes the internal user ID in lookups/updates. Guessing an object UUID is insufficient to access another user’s routine.

## High-impact actions

- Activation requires a passing latest simulation.
- Approval has an expiry, one-time consumption, action type, and SHA-256 payload hash.
- The payload includes proposal ID and version.
- Activation and rollback require `confirmed: true`.
- A snapshot is recorded before activation.

## Web/demo boundary

`/demo/session` is available only when `DEMO_MODE=true`. It issues a short-lived token for the synthetic `demo-user`. It must never provide access to real household data/devices. Production mode returns 404 for this route.

## HTTP controls

- request body limits;
- request IDs;
- rate limiting;
- origin allowlist;
- production host validation;
- `nosniff`, no-referrer, and no-store headers;
- bounded MCP session count and TTL;
- safe error responses.

## Data minimization

The micro-twin selects only referenced people and devices. Audit events contain structured lifecycle facts, not access tokens. Routine goals may contain household information and should be treated as private data in a real deployment.

## Production gaps

Before real household deployment, add a real identity provider, consent and deletion controls, encrypted secret management, vendor-specific device authorization, device-state verification, a shared MCP session store for multi-instance hosting, log redaction/retention policy, threat modeling, abuse testing, and independent security review.
