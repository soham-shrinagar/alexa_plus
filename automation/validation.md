# Validation and reproducibility

Reviewed October 22, 2026. This document separates executable checks, browser observations, historical reference evidence and participant testing. Start with [the README](../README.md) for clean installation.

## Automated release gate

Run `npm run check:release` from the repository root. It uses memory and clears provider/database settings in its child processes.

| Check | October 22 result |
| --- | --- |
| Full suite | 144 tests: 142 passed, zero failed, two optional database tests skipped |
| JavaScript syntax | 111 files checked |
| Prisma schema | Valid |
| Frozen synthetic acceptance corpus | 13/13 passed |
| Comparison with recorded HA semantic cases | Six matched |
| Root and server dependency audits | Zero reported vulnerabilities in both |
| Separately enabled Gemini smoke | Real preflight selected; engine found the failure and an eligible repair |
| Separately enabled Neon test | Returning identity, persistence, ownership and concurrent one-use export passed; its own records were cleaned |

Live checks are separate because they need private credentials and can consume provider quota. The default gate does not establish current live provider availability. Reproduce the opt-in checks using the commands in the README. The existing frozen corpus and its hash remain unchanged; new household fixtures supplement it.

## Representative supported automations

These examples were authored for testing. They are not customer installations or participant data. Each YAML has a matching JSON snapshot containing confirmed intent and independently declared final outputs.

| Fixture | Failure and normal output checked |
| --- | --- |
| `fixtures/office-override.yaml` + `.json` | Occupancy starts a 30-second light timer; a later manual override must retain light-on. An ordinary visit must still end off. Also checks brightness changes and unavailable targets. |
| `fixtures/bathroom-fan.yaml` + `.json` | A two-minute timer must respect later manual boost while normal completion still turns the fan off. Separate retrigger checks distinguish restart cancellation at 180000 ms from single-mode completion at 120500 ms. |
| `fixtures/porch-quiet.yaml` + `.json` | A literal button event must respect an enabled quiet-mode intention; normal button behavior must still turn the light on. A different event filter must not trigger the rule. |

`test/automation/realistic.test.js` imports all three over the actual browser MCP client and running HTTP server, runs preflight, compares identical scenarios before/after, reviews and approves export, rejects approval reuse, reimports exported YAML and checks every declared output. It runs without Gemini or a database. Paths under `test/` refer to `apps/mcp-server/`.

To inspect one case manually:

```sh
node apps/mcp-server/scripts/automationCli.js repair automation/fixtures/office-override.yaml automation/fixtures/office-override.json
```

To try it in the browser, choose Import a new project, select the matching YAML/JSON files, read the declared intent and outputs, confirm and import. Test inputs use explicit virtual milliseconds.

## Browser and usability inspection

The local memory workshop was exercised through registration, guided import, direct preflight, the 600 ms failure, causal/source replay, same-input before/after comparison, exact YAML review, explicit approval and download. Export was disabled before approval and after consumption. Reload restored the saved investigation. Desktop and narrow layouts were inspected for document overflow, and browser console diagnostics were checked.

Usability changes from inspection: editing the project name/YAML/JSON clears import confirmation; source editing clears previous export approval; the Project details controls have explicit accessible names. These are agent-operated browser checks, not independent human trials. Microphone transcription quality and real physical-device behavior have not been evaluated in this review.

## Security and correctness regressions

- Concurrent MCP initialization counts pending allocations against capacity. Rejected initialization is closed and does not occupy a session slot.
- HTTP and login request buckets have fixed memory bounds, reclaim expired entries and retain active limits at capacity. Unused demo OAuth codes are pruned and capped.
- Invalid OAuth grants/resources/scope types and malformed PKCE challenges produce error responses rather than HTTP success. Codes remain single-use.
- Script execution is restricted to same-origin resources. Object embeds, foreign framing and base-URL injection are blocked by response policy; request IDs accept only bounded safe characters.
- Unknown operation names, including inherited object-property names, are rejected explicitly.
- Prototype-named event-data keys reject atomically rather than silently dropping a literal filter during object validation.
- Truncated timing exploration cannot authorize candidate review/export. The UI marks incomplete coverage rather than presenting a completed check.
- Default local listening is loopback. Public/container binding is an explicit operator setting.

The review also checked owner isolation, stale-source/version rejection, token expiry, payload limits, YAML aliases/tags/templates, server-only provider credentials and ambiguous-write retry behavior through the existing suite. The unused root-package self-dependency was removed from the server package.

A clean staged-source archive, containing neither private environment files nor preinstalled dependencies, was installed with both `npm ci` commands, generated its Prisma client, and passed the release gate and both audits. Public Markdown links were checked against tracked files; a common provider-token/private-key pattern scan found no matches across tracked content and repository history. These bounded scans do not replace credential rotation or a full penetration test.

Hardening references: [Express security guidance](https://expressjs.com/en/advanced/best-practice-security/), [MCP security practices](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices). Audit results and source review do not establish that every possible vulnerability is absent. Production account recovery/revocation, distributed quotas, shared sessions, deployment monitoring and physical execution remain separate scope.

## Independent runtime evidence

The JSON captures under `reports/` record historical execution using isolated Home Assistant Core 2024.12.5 and virtual helpers. The actual export was parsed and executed in that runtime. The offline gate compares six semantic cases against the recorded observations; it does not rerun a live HA instance. Follow [the testbed guide](testbed/README.md) to repeat that experiment.

The historical shared-ten label comparison recorded engine 10/10 and Gemini-only 6/10. See [raw evaluation](reports/phase-6-evaluation.json). The author-written sample is small and not blinded, independently sampled or representative of all automations. No physical compatibility or universal verification claim follows from it.

## Human trial procedure — ready, not conducted

Invite two or three consenting people unfamiliar with the interface. Give them a temporary test account or ask them to create one on a disposable local runtime. Use the prepared fixtures; personal household data is unnecessary.

Ask each participant to:

1. Import the guided example after reading the intention and expected outputs.
2. Run preflight and explain the failure in their own words.
3. Locate the responsible action and its source line.
4. Compare before/after behavior and identify which ordinary behavior was preserved.
5. Review the exact patch and export it after approval.
6. Explain what was tested and whether anything was installed in a home.

Record whether each task was completed without help, approximate duration, where help was needed and whether the finite-model/export-only boundaries were understood. Use anonymous IDs, allow participants to stop and avoid collecting credentials or personal home data. Fix observed friction and repeat affected tasks.

| Participant | Completed without help | Understood cause | Understood check scope/export | Friction |
| --- | --- | --- | --- | --- |
| Pending | Not measured | Not measured | Not measured | No independent participants have been tested |

The executable cases and browser inspection are complete. Actual human trials require participants and remain pending; no participant outcomes have been invented.
