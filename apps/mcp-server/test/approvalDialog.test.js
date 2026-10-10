import assert from "node:assert/strict";
import test from "node:test";
import { confirmActivation } from "../public/approvalDialog.js";

class Dialog extends EventTarget {
  returnValue = "";
  open = false;
  showModal() { this.open = true; }
  close(result) {
    if (result !== undefined) this.returnValue = result;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  }
}

test("approval requires confirmation; later Escape cannot reuse the previous confirmation", async () => {
  const dialog = new Dialog();
  const copy = {};
  const request = { proposalVersion: 3, impact: { devices: ["Kettle"], steps: 7 } };
  const confirmed = confirmActivation(dialog, copy, request);
  assert.equal(dialog.open, true);
  assert.match(copy.textContent, /Version 3/);
  dialog.close("confirm");
  assert.equal(await confirmed, true);

  const escaped = confirmActivation(dialog, copy, request);
  assert.equal(dialog.returnValue, "");
  dialog.close(); // Native Escape preserves the dialog's current returnValue.
  assert.equal(await escaped, false);

  const cancelled = confirmActivation(dialog, copy, request);
  dialog.close("cancel");
  assert.equal(await cancelled, false);
});
