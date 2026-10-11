// Kept separate so cancellation/confirmation semantics are regression-tested
// without coupling the safety decision to the rest of the visual demo.
export function confirmActivation(dialog, copy, request) {
  return confirmAction(dialog, copy, { title: "Activate this verified version?", confirmLabel: "Confirm activation", message: `Version ${request.proposalVersion} passed verification. It references ${request.impact.devices.length} devices and ${request.impact.steps} steps. Your approval is cryptographically bound to this exact version.` });
}

export function confirmAction(dialog, copy, { title, message, confirmLabel = "Confirm" }) {
  // Escape must cancel this request, never reuse a previous dialog's result.
  dialog.returnValue = "";
  copy.textContent = message;
  const heading = dialog.querySelector?.("h2"); if (heading) heading.textContent = title;
  const button = dialog.querySelector?.("#confirm-approval"); if (button) button.textContent = confirmLabel;
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true }));
}
