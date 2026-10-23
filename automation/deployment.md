# Local judging and optional HTTPS deployment

## Recommended submission route

The [official FAQ](https://amazonappdev2026.devpost.com/details/faqs), rechecked October 23, 2026, permits a locally runnable repository and demo. It says the Alexa+ toolkit is gated to selected partners and unavailable to hackathon participants. Use the working web simulation and real MCP endpoint for this submission. Hosting is optional. The public repository includes an MIT license.

## Clean local setup

Use Node 22.9 or newer with npm and Git. In a clean directory:

```powershell
git clone https://github.com/soham-shrinagar/alexa_plus.git
cd alexa_plus
npm ci
npm ci --prefix apps/mcp-server
npm run prisma:generate
npm run check:release
npm --prefix apps/mcp-server start
```

Use `main`. Without an environment file the workshop binds loopback and uses temporary memory; direct analysis works offline after installation. Open `http://localhost:3000/automations`, create an account, load the example, confirm intent and import, then Run preflight. The conversation button needs a valid Gemini key; it is not silently simulated. A private repository first needs reviewer access.

For Neon and Gemini, copy `.env.example` to `apps/mcp-server/.env`, set `REPOSITORY_MODE=prisma`, `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and a stable `JWT_SECRET`. Keep the other local defaults. Then run:

```powershell
npm run check:automation-config
npm run prisma:migrate
npm run prisma:status
npm --prefix apps/mcp-server start
```

The migrate command applies committed additive migrations. Do not run reset or drop tables. Make a database backup before production changes. The default release check removes database/provider settings from its child processes and uses memory; it does not contact Neon or Gemini. `prisma:generate` generates code without changing the database. Windows and WSL must each install their own dependencies.

## Optional single-instance HTTPS hosting

Choose a Node host or VM that supports a long-running Node process and preserves incoming Host headers. This app holds MCP transports, request budgets and demo OAuth authorization codes in process memory: use one instance, or add tested session affinity/shared stores before horizontal scaling. Do not put the stateful server into per-request serverless execution without an adaptation.

1. Provision your host/domain and TLS termination in its dashboard. No host or paid resource has been provisioned by this implementation.
2. Deploy this branch with root `npm ci`, server `npm ci --prefix apps/mcp-server`, and `npm run prisma:generate` as build steps. Run `npm run prisma:migrate` once as a release job with the private Neon URL. Start from the root using `npm --prefix apps/mcp-server start`.
3. Configure `DEMO_MODE=false`, `AUTH_REQUIRED=true`, `REPOSITORY_MODE=prisma`, `PUBLIC_URL=https://YOUR_DOMAIN`, `DATABASE_URL`, a random private `JWT_SECRET` of at least 32 characters, and Gemini credentials. Use the platform's PORT. Set `ALLOWED_ORIGINS` to the exact HTTPS origin or leave it empty to permit only PUBLIC_URL's origin. No URL paths, usernames, passwords, query or fragment belong in PUBLIC_URL.
4. Set `AUTOMATION_REGISTRATION_ENABLED=true` only while creating reviewer accounts, then set false and restart. Returning login still works. Supply reviewer credentials privately in testing instructions, never in Git.
5. On a VM with a local reverse proxy bind `HOST=127.0.0.1`; expose only the proxy's HTTPS port. With a managed container proxy, use its required bind address and prevent public access to the internal HTTP port. Preserve the original public Host header. The server validates the configured origin even when internal requests are HTTP and does not trust arbitrary forwarded headers.
6. Run `npm run check:automation-config -- --production` within the deployed environment. This checks configuration only. Then open `/health` and the workspace over HTTPS. `/health` reports process/configuration state, not a database readiness probe; sign-in/import/restoration tests establish actual storage operation.
7. Verify registration policy, returning login after restart, real Gemini request, preflight, replay, one approved export, rejection of reuse, and rejection of an unauthenticated `/mcp` call. Inspect browser Network for initialize, initialized, tools/list, tools/call.
8. Keep secrets in the hosting secret store, rotate previously shared keys before public use, configure database backups, and limit reviewer traffic. The current request limiter sees a reverse proxy as one IP; its budget is shared behind that proxy. For a small controlled demo this is acceptable; production scale requires a reviewed trusted-proxy policy and distributed rate limits. Browser login has an additional eight-attempt/minute bucket. The October 21 dependency release passes both audits; rerun audits on later installs. Runtime Neon URLs without a connect_timeout get a 20-second connection budget; explicit operator values and CLI URLs are preserved.

An HTTPS deployment is not performed or claimed here. Platform selection, domain ownership and any billing remain owner decisions. Docker is not required; a container build has not been validated in this environment.

## MCP and identity boundary

The browser uses its own returning-account token over MCP 2025-11-25 Streamable HTTP. No OAuth client registration is needed for that route. The existing generic OAuth authorization-code flow is demo-only; production `/oauth/authorize` does not complete identity/consent. Do not interpret `OAUTH_CLIENTS_JSON` or a service token as complete Alexa account linking. Service tokens cannot access owner-scoped automation tools.

Future native Alexa work needs authorized platform access plus a real identity/consent implementation and end-to-end account-linking tests. That is outside the available hackathon path. Do not enable demo authorization in production to bypass it.

## Recovery

After a network interruption, restore the project before repeating a write; the previous operation might have completed. A consumed export approval requires a new review. After source edits or new analysis, review again. Expired sign-in tokens require login; persistent projects remain in Neon. If a deployment fails, redeploy a known tested commit from this branch while retaining additive database tables. Export download does not modify any household automation, so there is no physical rollback operation to perform.
