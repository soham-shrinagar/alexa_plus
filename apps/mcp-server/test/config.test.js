import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("configured DATABASE_URL selects persistence unless memory mode is explicit", () => {
  const env = { DATABASE_URL: "postgresql://placeholder" };
  assert.equal(loadConfig(env).repositoryMode, "prisma");
  assert.equal(loadConfig({ ...env, REPOSITORY_MODE: "memory" }).repositoryMode, "memory");
  assert.equal(loadConfig({}).repositoryMode, "memory");
});

test("production requires HTTPS, strong secrets, and authentication", () => {
  const env = { DEMO_MODE: "false", DATABASE_URL: "postgresql://placeholder", PUBLIC_URL: "https://rehearse.example", JWT_SECRET: "a".repeat(32) };
  assert.equal(loadConfig(env).repositoryMode, "prisma");
  assert.throws(() => loadConfig({ ...env, AUTH_REQUIRED: "false" }));
  assert.throws(() => loadConfig({ ...env, JWT_SECRET: "" }));
  assert.throws(() => loadConfig({ ...env, PUBLIC_URL: "http://rehearse.example" }));
});

test("Render's assigned URL supplies the public origin unless explicitly overridden", () => {
  const env = {
    DEMO_MODE: "false",
    DATABASE_URL: "postgresql://placeholder",
    JWT_SECRET: "a".repeat(32),
    RENDER_EXTERNAL_URL: "https://rehearse-workshop.onrender.com",
  };
  assert.equal(loadConfig(env).publicUrl, env.RENDER_EXTERNAL_URL);
  assert.equal(
    loadConfig({ ...env, PUBLIC_URL: "https://workshop.example/" }).publicUrl,
    "https://workshop.example",
  );
  assert.throws(() => loadConfig({ ...env, RENDER_EXTERNAL_URL: "http://unsafe.example" }));
});
