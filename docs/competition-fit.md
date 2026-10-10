# Competition fit and evidence

## Selected path

Use the Alexa+ track’s real MCP option: a self-hosted server implementing MCP specification `2025-11-25` over Streamable HTTP. Rehearse also includes a contestant-built web frontend that sends actual MCP `initialize`, `tools/list`, and `tools/call` requests.

## Why it stands out

Many assistant concepts retrieve information, answer questions, create reminders, or wrap a narrow API. Rehearse demonstrates a deeper agent loop:

1. interpret an outcome;
2. construct a relevant world model;
3. compile a multi-actor temporal plan;
4. predict failures before acting;
5. repair safe conflicts;
6. defer value choices to the human;
7. bind approval to verified state;
8. adapt at runtime;
9. roll back and explain.

This is visibly agentic and materially household-specific.

## Judging evidence

### Technical implementation

Real MCP transport, twelve tools, schemas, OAuth/PKCE, JWT scopes, user isolation, deterministic simulation, approvals, persistence adapters, migration, runtime adaptation, and automated tests.

### Design

Outcome-first input, visual timeline, plain-language conflicts, clear human decision point, approval modal, state indicators, micro-twin explanation, and visible MCP activity.

### Potential impact

The pattern can reduce brittle automation and safely coordinate people, appliances, quiet hours, energy limits, weather, travel, accessibility needs, and changing device availability.

### Idea quality

The mechanism is coherent: household autonomy should be rehearsed before execution. The micro-twin, verifier, human-value boundary, version-bound approval, and rollback all reinforce that thesis.

## Current official pages to recheck before submission

- Rules: https://amazonappdev2026.devpost.com/rules
- FAQ: https://amazonappdev2026.devpost.com/details/faqs
- Resources: https://amazonappdev2026.devpost.com/resources
- Alexa-track judge guidance: https://amazonappdev2026.devpost.com/forum_topics/45397-what-exactly-are-you-looking-for-in-the-alexa-track

Rules and submission fields can change. Treat these live pages as authoritative at submission time.

## Honest limitations to state

- Device side effects are simulated.
- The natural-language parser is bounded to the demo pattern.
- One scenario fixture is polished.
- Memory mode is the default demo mode.
- Production identity and vendor device adapters are future work.

These limitations do not weaken the central proof: the full safety lifecycle and MCP surface are implemented and demonstrable.
