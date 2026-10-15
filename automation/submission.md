# Rehearse Automations — submission and demo pack

Prepared October 16, 2026. This is a draft for the owner to review and submit, not an already submitted entry.

## Positioning and description draft

**Name:** Rehearse Automations

**Tagline:** Find the moment your automations disagree—before you change the home.

**Primary track:** Alexa+, using a simulated conversational experience with a real Streamable HTTP MCP server.

Rehearse helps people debug interactions between Home Assistant automations. A user imports supported rules and selected entity state, confirms the behavior they want, and asks the assistant to investigate. Rehearse executes experiments, finds a sequence that breaks that intention, and shows the causal action chain with source locations and virtual time.

The assistant can propose a literal guard and verify it against both the failing disturbances and independently specified ordinary outputs. Before/after replay uses identical inputs. Export requires review of the exact YAML and a fresh explicit approval bound to the same source, tests and candidate. Projects and investigations can persist across sign-ins through Neon.

The demo's delayed motion-off rule overrides manual hold. Rehearse reproduces the failure at 600 virtual milliseconds and verifies a guard that preserves normal switch-off behavior. The browser actually initializes MCP, discovers tools and calls them. Gemini selects validated workflows; the deterministic engine supplies findings. Independent Home Assistant runtime captures, including execution of the actual exported YAML, provide evidence for the supported semantics.

The current release deliberately supports a bounded YAML subset and finite experiments. It does not claim universal safety, automatic installation, physical rollback or native Alexa account connection. Our contribution is the complete evidence and review workflow around a recommendation. The original planner was significantly extended with the separate automation contract, engine, verification, persistent debugger workspace and MCP workflow; point reviewers to the phase commits.

## Demo storyboard: target 2 minutes 45 seconds

Prepare the running app, a permitted test account, the guided fixture and a working provider key. Hide terminals/env files and personal accounts from capture. Use the actual interface and current output; do not edit a failed interaction into a claimed success.

| Time | Visible action | Spoken point |
| --- | --- | --- |
| 0:00–0:15 | Open workshop and show the two rules/intention | “A delayed automation can undo a decision made after it started.” |
| 0:15–0:40 | Confirm/import example and send a real debugging request | “Check why motion overrides manual hold, and verify a fix while preserving normal completion.” |
| 0:40–1:05 | Show failed regression, 26 timing experiments and causal replay at 600 ms | “This action switches the lamp off while hold is on. These are executed inputs and a source-linked chain.” |
| 1:05–1:35 | Repair review and same-input before/after | “A guard checks the current hold immediately before off. The original fails; the repaired model retains the lamp.” |
| 1:35–1:55 | Regression table and exact normalized YAML | “Normal motion still finishes off. The check covers these declared experiments.” |
| 1:55–2:15 | Explicit approval and download | “Approval releases this exact patch once; installation remains a separate owner decision.” |
| 2:15–2:35 | Runtime evidence and saved project restoration | “The export has also been executed in isolated Home Assistant with virtual helpers. Neon retains the investigation.” |
| 2:35–2:45 | Show simulation label and closing workspace | “A simulated Alexa+ experience backed by a real MCP service, with inspectable evidence behind each proposed change.” |

If conversation is unavailable, state that plainly and demonstrate direct checks; do not imply a live provider response. A brief Network view of MCP handshake/discovery is optional supporting footage. Keep the product visible rather than spending the video in developer tools. The [rules](https://amazonappdev2026.devpost.com/rules) specify a video under three minutes, a GitHub repository with run instructions and developer feedback; verify the current form before publishing.

## Reviewer testing text

Use branch `new/automation`. Follow [deployment.md](deployment.md) for a clean local setup. No paid hardware is needed. Without an env file, create a local account in memory, load/confirm the example and press Run preflight. For conversational testing configure your own Gemini key privately; the direct engine does not need it. For durable sessions use Neon and committed additive migrations. The phase reports document actual evidence and limitations.

If providing a private hosted demo, put its URL and reviewer username/password in the private submission testing field, not this repository. Do not put your personal provider key in the judging instructions. Confirm reviewers can access the chosen repository branch. Licensing remains pending by the owner's choice; resolve public license or private access before submission.

## Developer feedback draft based on actual work

| Tool | Used for / what worked | Observed friction and suggestion |
| --- | --- | --- |
| MCP official SDK | Real Streamable HTTP server, authenticated tools and structured results | Client initialization/session handling must be tested beyond a tool unit test. Include end-to-end browser examples covering expiry and ambiguous write failures. |
| Gemini | Structured operation selection and a measured LLM-only baseline | Structured output still needs validation and cannot replace execution. In this small baseline it missed a delayed override and treated incomplete evidence as a pass. Preserve raw results and qualify the finding. |
| Home Assistant | Independent reference execution against virtual helpers; authenticated REST/WebSocket capture | YAML scalar differences mattered: unquoted on/off output was wrong for the HA loader. Validate the actual export file, not only a normalized in-memory model. |
| Prisma / Neon | Durable accounts/workspaces, additive schema and concurrency verification | Setup needs generated client and migrations. Current Prisma-chain audit advisories remain open; do not present a passing app test as dependency remediation. |
| Alexa+ ecosystem | Target conversational MCP experience | The official FAQ clarifies toolkit access is gated; keep access restrictions visible alongside individual setup guides. Native tooling was not tested, so no SDK-performance claim is made. |

The owner should add their own onboarding experience and whether they would use each tool again. These drafts do not claim conversations with Amazon, device access or a completed production rollout. The [official FAQ](https://amazonappdev2026.devpost.com/details/faqs) is the reference for access restrictions.

## User trial procedure (ready to run; no results claimed)

Ask two or three consenting testers who have not been coached through the UI to complete this sequence: create/sign in, import the example with confirmed intention, explain the failure in their own words, locate the responsible delayed action, compare the repair, check ordinary behavior and export after reviewing. Record completion, approximate duration, where help was required and whether they understood the finite-model limitation. Do not collect personal home data unless they choose to provide it.

| Anonymous participant | Completed without help? | Understood cause? | Understood what passed? | Friction / improvement |
| --- | --- | --- | --- | --- |
| Pending | — | — | — | No participant trial has been conducted or claimed |

## Owner checklist

- [ ] Review licensing (explicitly left pending) or arrange private reviewer access.
- [ ] Run the documented flow on the machine used for recording; confirm provider availability.
- [ ] Record, review and publish the actual demonstration video.
- [ ] Review description, testing instructions and developer feedback; fill team/track information.
- [ ] Confirm branch/repository/video links work for reviewers and disclose the simulated Alexa+ experience.
- [ ] Complete any desired user trials and record real outcomes separately from synthetic acceptance cases.
- [ ] Submit through Devpost before its displayed deadline and confirm submission status yourself.
- [ ] If deploying publicly, complete the deployment/secret/advisory items in the final report first.

No Devpost submission, video publication, collaborator invitation, license selection or hosting purchase has been performed automatically.
