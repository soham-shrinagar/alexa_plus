# Integration and owner configuration guide

This file separates what already works locally from what requires your accounts or production choices.

## A. Local demo: required now

### 1. Install and verify

```powershell
cd C:\Users\shrin\OneDrive\Desktop\alexa_plus
npm install
npm --prefix apps/mcp-server install
npm test
npm run prisma:validate
npm run prisma:generate
```

Reason: this proves the deterministic engine, service lifecycle, MCP transport, security checks, and generated Prisma client all agree.

### 2. Start in safe demo mode

From the repository root:

```powershell
npm start --prefix apps/mcp-server
```

The default configuration uses:

- `DEMO_MODE=true`;
- an in-memory repository;
- a process-local JWT secret;
- simulated device effects;
- `http://localhost:3000`.

Open `http://localhost:3000`. The browser calls `POST /demo/session`, receives a 30-minute token, initializes `/mcp`, lists tools, and uses `tools/call` for every product action.

### 3. Walk the demo manually

Use individual steps once before using the guided button:

1. Compile.
2. Simulate and read the four initial conflicts.
3. Repair and notice the unresolved Maya decision.
4. Revise with the Friday exception.
5. Approve in the dialog and activate.
6. Adapt to device failure and travel delay.
7. Roll back.

Reason: manual pacing makes it easy to explain why the system pauses instead of silently choosing for the family.

## B. PostgreSQL/Neon: optional persistence

The public demo does not require a database. Use memory mode for the most deterministic recording. Use Prisma only if you need persistence across server restarts.

### 1. Create an isolated database branch

Do not begin with a production database. Create a disposable Neon branch or separate PostgreSQL database.

### 2. Configure local secrets

Copy `.env.example` to `apps/mcp-server/.env` or provide environment variables through your shell. Never commit `.env`.

Required values:

```dotenv
DEMO_MODE=true
REPOSITORY_MODE=prisma
DATABASE_URL=postgresql://...
PUBLIC_URL=http://localhost:3000
AUTH_REQUIRED=true
JWT_SECRET=a-long-random-value
```

Reason: `REPOSITORY_MODE=prisma` selects persistence; the database URL remains secret; a stable JWT secret prevents tokens from becoming invalid after restart.

### 3. Apply the additive migration

```powershell
npm run prisma:migrate
npm run prisma:generate
```

The migration adds only Rehearse tables. It intentionally does not drop old LifeOps tables. Review `prisma/migrations/20261010000000_rehearse_domain/migration.sql` before applying.

### 4. Run the isolated persistence test

```powershell
$env:RUN_NEON_INTEGRATION="true"
npm run test:neon
Remove-Item Env:RUN_NEON_INTEGRATION
```

The test creates uniquely prefixed users, confirms ownership isolation and reconnect persistence, then cleans up those users. Still use only a disposable branch.

## C. Public HTTPS deployment: optional

The current competition FAQ says hosting is optional; a public repository and video can be sufficient. Deploy only if a live URL improves your submission and you can keep it reliable.

### 1. Choose a Node-compatible host

The host must support:

- Node.js 20+;
- long-running HTTP requests;
- environment secrets;
- HTTPS;
- the command `npm start --prefix apps/mcp-server`;
- optional outbound PostgreSQL access.

Streamable HTTP sessions are stored in process memory. Use one instance for the hackathon demo unless you add a shared session store or sticky sessions.

### 2. Production environment

```dotenv
DEMO_MODE=false
REPOSITORY_MODE=prisma
AUTH_REQUIRED=true
PUBLIC_URL=https://your-final-domain.example
JWT_SECRET=<at-least-32-random-bytes>
DATABASE_URL=<secret-postgresql-url>
ALLOWED_ORIGINS=https://your-final-domain.example
OAUTH_CLIENTS_JSON=[{"id":"your-client","secret":"secret-manager-value","redirectUris":["https://client.example/callback"]}]
```

Reasons:

- `DEMO_MODE=false` disables browser demo-token minting.
- `PUBLIC_URL` becomes the OAuth issuer and MCP audience, so it must be stable and exact.
- `ALLOWED_ORIGINS` limits cross-origin browser calls.
- `OAUTH_CLIENTS_JSON` registers confidential OAuth clients and allowed redirects.
- secret values must be configured in the host, never Git.

Important: the included browser UI relies on `/demo/session`. In strict production mode it cannot self-login. For a deployed public interactive demo, either keep a tightly controlled demo deployment with `DEMO_MODE=true` and no real devices/data, or integrate a real identity-provider login flow before setting `DEMO_MODE=false`.

### 3. Deployment checks

Check:

- `GET /health` returns `status: ok` and protocol `2025-11-25`;
- `GET /.well-known/oauth-protected-resource` references the exact public `/mcp` URL;
- an unauthenticated MCP request returns 401;
- initialize returns `Mcp-Session-Id`;
- the session can list all twelve tools;
- logs contain request IDs but no bearer tokens;
- a restart does not lose proposals when Prisma mode is used.

## D. Alexa+/competition integration decision

Use the competition’s real-MCP submission path. The repository already satisfies the technical shape: MCP `2025-11-25`, Streamable HTTP, source code, and a web client that demonstrates initialize/list/call. Do not claim official Alexa+ device execution.

In the written submission explain:

- Alexa+ is the conversational orchestrator envisioned to call this MCP server;
- the browser simulates the Alexa+ conversation and exposes internal evidence visually;
- the server and protocol interaction are real;
- household device effects are deliberately simulated because public Alexa+ tooling is unavailable and safety is central to the concept.

## E. GitHub and Devpost

### GitHub

Before the first push:

1. Run `git status --short`.
2. Confirm `.env` is not listed.
3. Search for accidental credentials and connection strings.
4. Run `npm test` from a clean install.
5. Confirm all Markdown documents are included.
6. Make the repository public only when ready.

No GitHub push or repository mutation has been performed by this implementation.

### Video

Record at 1080p if possible. Keep it under three minutes. Show the connection indicator and MCP activity panel, not only slides. Follow `docs/demo-script.md`.

### Devpost

You must provide:

- final project title and short description;
- public source repository URL;
- public YouTube/Vimeo video URL;
- team/member eligibility details;
- technologies and product feedback;
- any optional genuine friction log;
- required acknowledgements on the live form.

Recheck the live rules immediately before submission because dates, fields, and clarifications can change.

## F. Secret generation examples

PowerShell can generate a local JWT secret without printing other environment values:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Store the result in a secret manager. Do not paste it into a tracked Markdown file, screenshot, issue, or demo video.

## G. Final owner checklist

- [ ] Watch one complete local guided run.
- [ ] Confirm the narrative and names you want in the video.
- [ ] Decide local-only versus public deployment.
- [ ] If deploying, configure secrets and a disposable database branch first.
- [ ] Run all tests from a clean clone.
- [ ] Inspect repository for secrets.
- [ ] Push to a public GitHub repository.
- [ ] Record and publish the under-three-minute video.
- [ ] Complete Devpost fields and authentic product feedback.
- [ ] Verify every public link in an incognito window.
- [ ] Submit before the live deadline.
