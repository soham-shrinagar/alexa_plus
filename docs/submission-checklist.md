# Final submission checklist — Rehearse

Checked on 2026-10-11. No GitHub push has been performed. This is the owner handoff, not a claim that the entry has already been submitted.

## Already verified in this checkout

- [x] Existing Neon database inspected; legacy migration history safely baselined.
- [x] Additive Rehearse migration applied without dropping existing tables/data.
- [x] Four migrations recorded; database schema matches Prisma with no drift.
- [x] Database URL auto-selects Prisma; server and Prisma CLI load the app `.env`.
- [x] 27 ordinary automated tests passed and the separate live Neon MCP test passed.
- [x] JavaScript syntax and Prisma validation/client generation checked.
- [x] Clean-source-copy installation without `.env` passed, including 27 tests and actual server startup in memory mode.
- [x] Approval/version/concurrency, isolation, Friday exceptions, aggregate power, delay/weather, suspension, and rollback regressions covered.
- [x] Browser flow verified: real MCP traffic, cancelled approval, confirmed activation, adaptation, rollback, and responsive layout.
- [x] Current limitations and dependency-audit findings disclosed in [progress.md](../progress.md).

## Competition requirements to confirm

Deadline: **October 23, 2026, noon PDT = October 24, 2026, 00:30 IST**. Submit earlier. Provide functioning source, setup instructions, a description, and a publicly visible YouTube/Vimeo demo below three minutes. Use English or translations. Public source needs a detectable open-source license; private source needs the named reviewers' access. Complete eligibility, track selection, and genuine tool feedback. Keep judging access through November 20, noon Pacific. [Official rules](https://amazonappdev2026.devpost.com/rules).

Hosting is optional. A browser MCP demonstration is accepted; there is no requirement to obtain inaccessible Alexa+ tooling. [Official FAQ](https://amazonappdev2026.devpost.com/details/faqs).

## 1. Choose repository access and license

- [ ] Decide public-with-license or private-with-reviewer-access. Public is simpler for discoverability, not mandatory.
- [ ] For public source, choose a license you are authorized to apply and add the root `LICENSE` file. The app currently declares ISC in package metadata, but no root license exists. Confirm ISC or choose another deliberately; do not assume that label completes licensing.
- [ ] For private source, use the live rules' reviewer list and verify accepted invitations. Current usernames: `chris-trag`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar`.
- [ ] Check that contributed code/media are yours or appropriately licensed, and include any necessary attribution.

Reason: judges need a usable code handoff, and publishing a license is an owner/legal choice. No repository permissions or publication were changed for you.

## 2. Freeze and reproduce the code

- [ ] Review the working diff, especially schema baselining and lifecycle changes.
- [ ] Commit locally only when satisfied. A later GitHub push remains your explicit decision.
- [ ] Check the working tree **and commit history** for credentials. Keep `.env`, connection strings, OAuth secrets, tokens, and personal data out of screenshots and source.
- [ ] From a fresh checkout without your `.env`, follow the README using Node.js 22.9+:

```powershell
npm ci
npm --prefix apps/mcp-server ci
npm run prisma:generate
npm run check
npm test
npm run prisma:validate
npm start --prefix apps/mcp-server
```

- [ ] Recheck your final published checkout at `http://localhost:3000` in memory mode without accounts. A temporary clean source copy already passed installation, 27 tests, and actual server startup without `.env` during this review; repeat after any final packaging changes.
- [ ] If reproducing persistence, configure a separate Neon branch and follow [integration.md](../integration.md). Your existing database is already migrated; do not repeat manual baselining on it.
- [ ] Decide how to handle the four high-severity Prisma CLI dependency findings. A production deployment needs a compatible remediation and retesting, not `npm audit fix --force`.

Reason: judges should not require your secret Neon URL to reproduce the core safety story.

## 3. Rehearse and record the evidence

- [ ] Use [demo-script.md](demo-script.md) for the narrative and manual pacing.
- [ ] Show the initial conflicts, objective repair, remaining family decision, Friday-only revision, and passing verification.
- [ ] Pause visibly at the approval dialog; demonstrate that no device action precedes approval.
- [ ] Show optional coffee removal, departure at 07:25 after travel delay, re-verification, rollback, and the MCP activity panel.
- [ ] Explain exactly what is real: server, protocol, deterministic evaluation, approval, persisted lifecycle, and virtual-state restoration.
- [ ] Explain exactly what is simulated: household inputs, voice/Alexa experience, device schedules/effects. No physical executor or wall-clock scheduler is implemented.
- [ ] Do not imply arbitrary natural-language household requests work; the current rule parser and revision grammar support one polished scenario.
- [ ] Record clean readable footage, hide secrets, check audio/captions, and verify the published video while signed out.

Reason: the strongest evidence is a coherent failure → repair → human choice → verified action → recovery story, not a list of claimed integrations.

## 4. Prepare the Devpost text

- [ ] Use the project name **Rehearse** and a concise promise: “Prove household routines before they run.”
- [ ] Explain the real customer problem, temporary micro-twin, deterministic constraints, and why human approval protects family preferences.
- [ ] Select Alexa+ and describe the real MCP server with simulated household effects. Do not claim an official Alexa-hosted skill or physical device certification.
- [ ] List actual tools: MCP TypeScript SDK used from JavaScript, Node/Express, Zod, JWT/OAuth scaffolding, Prisma, PostgreSQL/Neon, browser HTML/CSS/modules, and any development tools you genuinely used.
- [ ] For tool feedback, fill your own observations under: purpose; onboarding; strengths; difficulties/workarounds; whether you would use it again and why. The migration-history mismatch and CUID/UUID mismatch are concrete technical experiences, not invented sponsor feedback.
- [ ] Only select additional challenges if you have real evidence. This repository does not implement AWS services; do not claim AWS integration because Neon is hosted.
- [ ] An optional friction log should contain dated tasks, expected/actual behavior, impact, workaround, and a useful suggestion. Do not manufacture usage history.
- [ ] Complete team/profile fields, account/eligibility declarations, repository/video links, and any other fields on the live form yourself.

## 5. Optional public hosting

- [ ] Decide whether it adds value. Local reproducible code and a strong video are sufficient for the current permitted workflow.
- [ ] If hosting a demo, use only synthetic household data, one server instance, HTTPS, a stable secret, correct public URL/origins, and a retention plan for synthetic demo users.
- [ ] Strict `DEMO_MODE=false` disables browser token minting. A production browser login is not implemented; do not deploy strict mode expecting the demo button to log users in.
- [ ] Recheck auth/host/origin/session behavior behind the selected host's proxy. Follow [integration.md](../integration.md) and [security.md](security.md).

No Echo hardware, paid Alexa API, Google Calendar credentials, or LLM API key is needed for the current deterministic demonstration.

## 6. Final submission gate

- [ ] Upload the intended final source after your review and explicit publication decision.
- [ ] Verify every link using a signed-out browser, or the actual reviewer access route for private source.
- [ ] Confirm README, video, description, and code make the same claims.
- [ ] Recheck the live rules and deadline shortly before submitting.
- [ ] Submit the entry, not merely save a draft; keep confirmation evidence.
- [ ] Keep source/video/testing access available throughout judging; do not publish real database credentials as test instructions.

The remaining mandatory owner actions are repository access/licensing, clean-checkout rehearsal, public video, truthful feedback/submission text, eligibility, and final Devpost submission. Neon configuration/migration is complete. Public hosting and real-device integration are not prerequisites for this demo.
