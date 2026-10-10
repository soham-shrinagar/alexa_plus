// Kept separate so cancellation/confirmation semantics are regression-tested
// without coupling the safety decision to the rest of the visual demo.
export function confirmActivation(dialog, copy, request) {
  // Escape must cancel this request, never reuse a previous dialog's result.
  dialog.returnValue = "";
  copy.textContent = `Version ${request.proposalVersion} passed verification. It references ${request.impact.devices.length} devices and ${request.impact.steps} steps. Your approval is cryptographically bound to this exact version.`;
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true }));
}
