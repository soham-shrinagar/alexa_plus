import test from "node:test";
import assert from "node:assert/strict";
import { prismaConnectionOptions } from "../src/repositories/prismaClient.js";

test("Neon wake-up timeout retains credentials, TLS and schema parameters", () => {
  const result = prismaConnectionOptions(
    "postgresql://test:p%40ss@sample.neon.tech/test?sslmode=require&schema=workshop",
  );
  const url = new URL(result.datasourceUrl);
  assert.equal(url.searchParams.get("connect_timeout"), "20");
  assert.equal(url.searchParams.get("sslmode"), "require");
  assert.equal(url.searchParams.get("schema"), "workshop");
  assert.equal(url.password, "p%40ss");
});

test("explicit timeouts and non-Neon connections are left to the configured datasource", () => {
  for (const url of [
    "postgresql://test:local@sample.neon.tech/test?connect_timeout=7",
    "postgresql://test:local@localhost/test",
    "postgresql://test:local@sample.neon.tech.attacker.test/test",
    "file:local.db",
    "not a URL",
    "",
  ])
    assert.deepEqual(prismaConnectionOptions(url), { log: [] });
});
