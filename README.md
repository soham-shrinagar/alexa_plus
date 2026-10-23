# Rehearse — the automation workshop

Rehearse is a conversational debugger and preflight checker for a supported subset of Home Assistant automations. Import your rules, confirm the behavior you expect, replay a failure, and verify a scoped repair before reviewing and downloading its YAML.

The submission is a **web simulation of an Alexa+ conversational experience backed by a real MCP server**. Native Alexa/Echo account linking, physical device control and automatic Home Assistant installation are not implemented.

## Try it from a clean checkout

Requirements: Git, Node.js **22.9 or newer**, npm and a browser. Hardware, provider keys and a database are unnecessary for the direct debugging workflow. Installation requires internet access; the installed local engine can run offline.

```sh
git clone https://github.com/soham-shrinagar/alexa_plus.git
cd alexa_plus
npm ci
npm ci --prefix apps/mcp-server
npm run prisma:generate
npm run check:release
npm --prefix apps/mcp-server start
```

Use the default `main` branch. The commands work in PowerShell and a Unix shell. Install dependencies independently in Windows and WSL; do not share their `node_modules`. Prisma generation does not modify a database.

Open [http://localhost:3000/automations](http://localhost:3000/automations). With no environment file, the application binds loopback and uses temporary memory. Accounts and projects disappear when it stops. If a private environment file already exists, its configuration applies; explicitly use `REPOSITORY_MODE=memory` for a temporary evaluation. The server does not silently switch to memory if configured persistence fails.

1. Create a local account with a username and a password of at least 12 characters.
2. Choose **Start with the example**. Read the expectation and test outputs, confirm them, and import.
3. Choose **Run preflight**. The original example has one failed regression, 26 timing experiments and one eligible guard repair.
4. Choose **Follow the causal chain**. At 600 virtual milliseconds the delayed motion action turns the lamp off while manual hold is on.
5. Open **Repair**, then **Replay before & after**. Both replays use identical inputs; the repair also preserves ordinary motion switch-off.
6. Choose **Review exact patch**, inspect the YAML and regression table, explicitly approve, and download.

Export does not install anything. It releases the exact reviewed YAML once for separate manual review. The original day/journey planner is retained at `/dayboard`.

## What the project does

- Atomically imports supported YAML, selected entity state, confirmed expectations and independent regression outputs, with source line mapping.
- Executes rules on a deterministic virtual clock and records a parent-linked causal trace.
- Explores finite disturbance timings and two tie orders, displaying incomplete evidence and search limits.
- Reduces selected failing input sequences and proposes one literal state guard before a responsible action.
- Rechecks the candidate against declared normal outputs and the same explored disturbances. Truncated search blocks candidate export.
- Provides saved projects, source versions, investigation history, replay, same-input comparison and exact patch review.
- Uses real Gemini operation selection when configured. Engine-derived results supply the findings; direct checks remain available without Gemini.
- Requires current, explicit, expiring, single-use approval for export, bound to owner scope, source, project, tests and candidate.
- Offers optional voice input as an editable transcript; speech is never automatically submitted.

## Architecture and MCP

```text
Browser workshop
  -> authenticated MCP Streamable HTTP (/mcp)
  -> validated automation service
  -> YAML contract -> deterministic execution -> bounded search/repair
  -> replay + regression evidence -> exact review -> approved YAML download
```

The browser initializes MCP, sends the initialized notification, discovers tools and calls them using protocol **2025-11-25** and the official MCP SDK. Login, the fixed example, the guide and reference evidence use ordinary HTTP.

| Component | Location |
| --- | --- |
| Express server, origin/auth/session controls | `apps/mcp-server/src/server.js`, `src/auth/` |
| Strict schema, YAML import/export and event engine | `apps/mcp-server/src/automation/` |
| Verification, project workflow and persistence | `src/automation/verification.js`, `service.js`, `store.js` |
| Workshop and actual browser MCP transport | `apps/mcp-server/public/automation/` |
| Database schema and additive migrations | `prisma/` |
| Independent Home Assistant runtime | `automation/testbed/` |
| Representative inputs and recorded evidence | `automation/fixtures/`, `automation/reports/*.json` |

`src/` entries in the table are relative to `apps/mcp-server/`. The twelve automation tools are `automation.import`, `automation.list`, `automation.get`, `automation.inspect`, `automation.preflight`, `automation.search`, `automation.repair`, `automation.trace`, `automation.compare`, `automation.review`, `automation.export` and `automation.respond`. The authenticated HTTP facade reaches the same service. The original planner's tools remain available.

## Optional conversation and persistence

Copy `.env.example` to `apps/mcp-server/.env` and supply credentials privately. Both features are optional:

| Configuration | Enables |
| --- | --- |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Real conversational operation selection and validated drafts |
| `REPOSITORY_MODE=prisma`, `DATABASE_URL` | Returning accounts and projects persisted in Neon/PostgreSQL |
| `JWT_SECRET` | Stable token signing across server restarts; required for production |

For persistence, apply the committed migrations:

```sh
npm run check:automation-config
npm run prisma:migrate
npm run prisma:status
npm --prefix apps/mcp-server start
```

Migration applies additive tables; do not substitute reset/drop commands. Passwords are salted scrypt hashes. Tokens expire after one hour. Provider keys stay on the server; a browser tab retains only its short-lived account token in session storage.

The original planner additionally integrates Open-Meteo weather and optional TomTom routing. Neither is required for automation debugging. A selected-state Home Assistant read adapter exists for operator configuration; the workshop does not connect to a household by default.

## Reproduce verification

```sh
npm run check:release
npm run test:automation
npm run automation:evaluate
npm audit --audit-level=high
npm audit --prefix apps/mcp-server --audit-level=high
```

`check:release` runs the full tests, JavaScript syntax checks, Prisma schema validation, the frozen 13-case acceptance corpus and comparison with six recorded HA semantic cases. It removes provider/database settings in child processes and uses memory. Live database tests are skipped by default.

Additional representative office-light, bathroom-fan and porch-button imports exercise real MCP diagnosis, comparison, approved export and reimport. They also check retrigger cancellation, light brightness, literal event filtering and unavailable targets. These are author-written examples, not participant or physical-household data. See [validation and user-trial procedure](automation/validation.md).

For a CLI investigation:

```sh
node apps/mcp-server/scripts/automationCli.js repair automation/fixtures/office-override.yaml automation/fixtures/office-override.json
```

Opt-in provider testing consumes real requests:

```sh
node apps/mcp-server/scripts/automationLlmSmoke.js
```

For the isolated account/workspace persistence test in PowerShell:

```powershell
$env:AUTOMATION_NEON_TEST='1'
node --env-file=apps/mcp-server/.env --test apps/mcp-server/test/automation/neon.test.js
Remove-Item Env:AUTOMATION_NEON_TEST
```

Use a permitted test database. This automation test creates and cleans only its own records. The older planner database suite has separate isolation requirements.

Real Home Assistant observations were recorded using isolated **Home Assistant Core 2024.12.5** and virtual helpers, including execution of the actual exported YAML. The offline release gate compares against those checked-in observations; it does not launch HA. Follow [testbed reproduction](automation/testbed/README.md) to repeat the independent runtime experiment.

The frozen acceptance set passes 13/13. A historical ten-case label comparison recorded engine 10/10 and Gemini-only 6/10 in [raw evaluation evidence](automation/reports/phase-6-evaluation.json). This small author-written set is not a representative accuracy benchmark or independent user study.

## Supported scope and limitations

Supported: explicit state/event triggers, flat literal event filters, literal state conditions, sequential on/off/light-brightness actions, constant delays, and `single`/`restart` modes. Selected entities are `input_boolean`, `binary_sensor`, `switch` and `light`; binary sensors are input-only.

Unsupported inputs reject atomically: templates/Jinja, clock/DST triggers, dynamic/group/area targets, blueprints, `for`, queued/parallel execution and arbitrary services. Imports and runs have explicit size, time and execution budgets. Export is normalized YAML; original comments/layout are not preserved.

`NO_VIOLATION_FOUND` covers one finite declared experiment. Unknown state, missing intent, pending work and exhausted budgets stay visible. Search is not exhaustive; repair is one guard, not general synthesis. Reference HA evidence concerns virtual helpers on the recorded version, not physical timing or compatibility with every release.

Native Alexa linking, physical installation/rollback, production account recovery/OIDC, multi-instance session coordination, broad HA semantics and the original planner's background traffic notifications remain future work. Independent human trials, recording/publishing the demo video and final competition submission remain owner activities; no results or submission are implied.

## Deployment and reviewer access

[Deployment instructions](automation/deployment.md) cover local review and optional single-instance HTTPS hosting. A public deployment requires private stable secrets, HTTPS, production registration/origin policy and backups. Bind loopback behind a local proxy; set `HOST=0.0.0.0` explicitly only where a managed container requires it. Session/rate state is in process memory. No public deployment is claimed.

The public repository is [MIT licensed](LICENSE); judges can clone the default `main` branch. The [official FAQ](https://amazonappdev2026.devpost.com/details/faqs) confirms that a locally runnable repository plus demo video is sufficient for the Alexa+ track; a hosted service is optional. Describe the Alexa+ experience as a simulation and the MCP implementation as real. See [developer feedback and friction log](automation/feedback.md) for implementation observations.

For a plain-language explanation and the full user flow, read [the project walkthrough](automation/walkthrough.md). For the complete input contract and engine details, read [the technical guide](automation/overview.md). [Final release checks](automation/release-readiness.md) record the submission review. Internal phase diaries and owner planning drafts are excluded from Git; public reproduction guides, fixtures and sanitized runtime evidence remain tracked.
