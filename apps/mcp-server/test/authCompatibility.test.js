import test from "node:test";
import assert from "node:assert/strict";
import { createAuthMiddleware } from "../src/auth/middleware.js";

test("Amazon preview challenge compatibility never bypasses Bearer authentication", () => {
  for (const alexaAuthCompatibility of [false, true]) {
    let nextCalled = false;
    const headers = {};
    let status;
    const response = {
      set(name, value) {
        headers[name] = value;
      },
      status(value) {
        status = value;
        return this;
      },
      json(value) {
        return value;
      },
    };
    const middleware = createAuthMiddleware({
      config: {
        authRequired: true,
        alexaAuthCompatibility,
        publicUrl: "https://test.example",
      },
      tokenService: {
        verify() {
          throw new Error("invalid");
        },
      },
    });
    middleware({ get: () => undefined }, response, () => {
      nextCalled = true;
    });
    assert.equal(status, 401);
    assert.equal(nextCalled, false);
    assert.equal(Boolean(headers["WWW-Authenticate"]), !alexaAuthCompatibility);
  }
});
