# Demo script (target: 2 minutes 35 seconds)

## 0:00–0:18 — Problem and promise

“Household automations usually fail at the moment they become real: two devices overload a circuit, a reminder wakes a baby, or weather makes the whole schedule impossible. Rehearse is a safety layer for Alexa+ that proves a routine before the household lives through it.”

Show the landing view and point briefly to “MCP 2025-11-25.”

## 0:18–0:40 — Compile

Read only the essential goal: leave by 7:45, stay quiet before 7, avoid kettle/heater overlap, and leave 15 minutes early in rain.

Click Compile.

“Rehearse builds a temporary micro-twin containing only the people and devices this decision needs. It is not trying to clone the entire house.”

Show the relevant-entity count and chips.

## 0:40–1:02 — Simulate

Click Simulate.

“The deterministic rehearsal finds the power overlap, the early announcement, and the rainy 7:30 deadline. Maya cannot finish by then if she starts at 7.”

Show findings and timeline. Mention that no device action has run.

## 1:02–1:27 — Repair and human decision

Click Repair.

“It can safely move water heating, the announcement, and departure. But waking Maya earlier is a family decision, so it stops.”

Click Revise.

“The family allows 6:50 on Fridays. Only that constraint changes; the revised version now passes.”

## 1:27–1:50 — Approval

Click Approve, pause on the dialog.

“Approval is short-lived and cryptographically bound to this exact proposal version. Any edit would require new approval.”

Confirm activation.

## 1:50–2:16 — Live adaptation

Click Adapt.

“Now the coffee machine becomes unavailable and traffic adds five minutes. Coffee is optional, so it is skipped. Departure advances to 7:25. The changed routine is simulated again and still passes.”

Show the timeline and green constraint result.

## 2:16–2:35 — Rollback and close

Click Rollback.

“Rehearse restores the captured snapshot and keeps an audit trail. The device effects here are simulated, but the MCP server, browser client, compiler, verification, approval, adaptation, OAuth surface, and persistence design are real. Alexa should not discover a routine is unsafe while your family is living through it. Rehearse it first.”

## Recording checklist

- Hide terminals containing environment variables.
- Use a fresh server so the timeline begins cleanly.
- Keep the browser connection indicator and MCP activity visible.
- Avoid scrolling through source during the main story.
- Include repository/architecture proof only as a brief final cut if time remains.
- Publish as public/unlisted only if the live submission permits it; verify the URL in a signed-out window.
