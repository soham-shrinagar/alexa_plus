# Phase 5 — Integrated automation workshop

## Delivered experience

The new HTML/CSS/modular-JS workshop is the primary page at `/` and `/automations`. Its cream/paper/navy theme is consistent across Investigation, Causal replay, Repair review, Rules & context, and Runtime evidence. The original dayboard is retained at `/dayboard`; the legacy lab redirect now targets it.

Users create/sign in to an account, restore projects, load the guided example or import YAML plus snapshot/intent/regressions, explicitly confirm intended behavior, and run direct or conversational preflight. The source editor supports file selection and a new-version workflow. Unsupported rules show atomic rejection issues. Selected project and short-lived token restore within the browser tab; durable account/project state lives in Neon. No server provider keys are stored in the browser.

Conversation uses the real service and Gemini. Direct checks remain usable without it. The replay shows the declared initial snapshot, timestamped inputs/actions/state changes, original source lines and a selectable parent chain. Slider/previous/next controls reconstruct entity state at the chosen event; large feedback traces use a moving DOM window. Original and repaired models replay identical inputs through the new read-only `automation.compare` tool. Repaired source indices are not incorrectly attributed to original YAML lines.

Repair review shows candidate rationale, unresolved counts, normal-output regression assertions, and exact normalized before/after YAML. The approval checkbox starts clear. Opening the source editor clears local review/approval, and server source changes invalidate old reviews. Explicit download consumes a server-rechecked approval once and resets the checkbox/control. No installation is performed.

The runtime-evidence view serves the fixed sanitized HA captures, with version/time, virtual-helper scope, independently asserted outputs and authenticated observations. A project-hash comparison identifies the reference model; unrelated imports are explicitly distinguished. The guide and reproduction commands are accessible from the workspace. Voice reuses the tested browser adapter; transcripts remain editable and require Send. Actual microphone capture/quality requires a permitted supported browser and remains a manual check.

## Compatibility correction and extra verification

The final patch review exposed a real issue in the earlier normalized exporter: YAML 1.2 serialization left on/off unquoted, while HA's YAML 1.1 loader interpreted them as booleans. The exporter now uses YAML 1.1 string quoting. Import also uses HA scalar semantics and rejects incompatible YAML directives/non-string mapping keys. Tests explicitly catch boolean-conversion regressions.

The testbed gained `--verified-yaml`. It reads the actual exported file, parses it with HA's loader, asserts equality with the candidate rule model, and uses those parsed rules in the after cases. `phase-5-ha-export.json` records its raw SHA-256 and actual-export parsing flag; all six before/after cases and state-change comparisons passed. The browser-approved download's bytes matched that independently executed file exactly. Earlier Phase 3 evidence tested normalized rule models; this phase additionally verifies the file that a user receives.

The HA read adapter now bounds streaming response bytes before complete buffering and cancels oversized bodies. The engine queue uses a stable minimum heap with the same virtual-time/insertion ordering, and bounds queued fan-out as well as execution steps; exceeding either budget remains incomplete. Source/browser modules were formatted for readable maintenance; the pure interpreter still has no provider/database dependency.

## Browser checks completed

Using the in-app browser against a local test instance with Neon and Gemini:

- Disposable account creation, confirmed guided import, page reload and saved project restoration.
- Three regressions, one failed behavior, 26 timing experiments, and one verified guard displayed from server results.
- Original causal replay: hold on, lamp off at 600 ms, with source-line/parent chain. Repaired replay: guard stops off at 600 ms, lamp remains on.
- All three regression assertions displayed as passed for the candidate; export disabled before confirmation, downloaded after explicit approval, then disabled/reset again.
- A fresh checked review is cleared when opening the source editor. Unsupported parallel-mode edit rejects without changing saved version 1.
- Live Gemini conversation submitted from the UI; deterministic results and saved conversation are restored.
- Local server stopped during a request: visible connection error and retained investigation. Restart invalidated the random demo signing key; signing in to the same account restored the source and analysis from Neon.
- Narrow viewport override applied and reset; mobile CSS (40px heading) active, document width within viewport, stacked forms and usable project navigation. Desktop theme inspected visually. Authentication/analysis requests show an in-progress state while Neon responds.

The disposable QA account and its one example project were removed by exact owner/record IDs after verification. Existing user/planner data was unchanged. The browser export was moved into ignored `artifacts/automation/browser-approved-export.yaml`; the screenshot is `artifacts/automation/phase-5-replay.jpg`. Reference captures and phase reports are tracked; screenshots and temporary browser artifacts remain ignored. The removed synthetic test records can be recreated from the guided fixture; they are not a backup of user data.

## Reproduce / remaining

Final verification: 125 tests total, 123 passed, zero failed, two opt-in database tests skipped by default. The configured Neon test was separately run and passed in Phase 4. Syntax checks passed for 99 JavaScript files. The updated heap interpreter still matched all six independent semantic captures and all six actual-export before/after captures. Browser checks used the real configured Gemini/Neon service, not mocked local results.

Follow `automation/overview.md` for complete setup and user steps, and `testbed/README.md` for actual-export verification. Phase 6 remains: held-out evaluation, user trials, final hosting and HTTPS identity setup, authorized Alexa toolkit testing or the labeled simulation submission, and demo/video/Devpost assets. General synthesis, broader HA semantics, proven cycles, physical-device behavior, production recovery/OIDC and MCP App packaging remain outside these five phases.
