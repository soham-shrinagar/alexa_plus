// Deliberately bounded follow-up grammar. Unknown/ambiguous actions never
// authorize activation and are clarified rather than guessed.
export function followUp(message) {
  const text = message
    .trim()
    .toLowerCase()
    .replace(/[?.!]+$/g, "");
  if (/^(cancel|stop speaking|stop listening)$/.test(text))
    return { kind: "cancel" };
  if (/^(show( me)? (the )?details|under the hood)$/.test(text))
    return { kind: "details" };
  if (
    /^(why is (that|this|the) option blocked|why (is it|does it fail|blocked))$/.test(
      text,
    )
  )
    return { kind: "why" };
  const choice = text.match(
    /^(choose|select|pick)( the)? (first|second|1|2)( option)?$/,
  );
  if (choice)
    return {
      kind: "choice",
      index: ["second", "2"].includes(choice[3]) ? 1 : 0,
    };
  const traffic = text.match(
    /^(what if( the)? traffic( is)?|traffic) (is )?(\d+) (minutes?|min)( worse| extra| slower)?$/,
  );
  if (traffic) {
    const minutes = Number(traffic[5]);
    return minutes <= 60
      ? {
          kind: "rehearse",
          scenario: {
            events: [{ type: "TRAVEL_DELAY", minutes, hypothetical: true }],
          },
        }
      : {
          kind: "clarify",
          reply: "Use a travel allowance from 0 to 60 minutes.",
        };
  }
  if (/^(what if( it)? rains|what if( it)? is raining|assume rain)$/.test(text))
    return {
      kind: "rehearse",
      scenario: {
        events: [{ type: "RAIN", raining: true, hypothetical: true }],
      },
    };
  if (/traffic.*(bad|worse)|start later/.test(text))
    return {
      kind: "clarify",
      reply:
        "How many extra minutes should I test? For example: what if traffic is 15 minutes worse? Starting later also needs a new time and the deadline you want to keep.",
    };
  if (/^(approve|yes|start( the)?( simulation)?|activate)$/.test(text))
    return { kind: "review" };
  if (/^new plan[: ]/.test(text))
    return { kind: "new", message: message.replace(/^new plan[: ]+/i, "") };
  return { kind: "unknown" };
}
export function concisePlan(proposal, simulation) {
  const routine = proposal.routine,
    status = simulation?.status;
  const checks =
    simulation?.summary?.checkedConstraints ?? routine.constraints.length;
  if (status !== "PASSED")
    return `This plan has ${simulation?.violations?.length ?? "unresolved"} possible conflicts. It has not been approved. Open details or compare a repair.`;
  const journey = routine.journey;
  return journey
    ? `Start preparation at ${journey.readyTime}, leave at ${journey.departureTime}, and arrive by ${journey.arrivalTime}. The schedule reserves ${journey.safetyBufferMinutes} minutes of safety buffer and was checked against ${checks} declared rules. Travel remains an estimate.`
    : `Your ${routine.steps.length}-task plan was checked against ${checks} declared rules. Review the details before approving simulated execution.`;
}
