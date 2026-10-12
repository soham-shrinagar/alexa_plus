import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import http from "node:http";
import { createApplication } from "../src/server.js";
import { PlannerService } from "../src/services/plannerService.js";
import { EnvironmentProvider } from "../src/providers/environment.js";

test("default MCP planning context is personal and never silently falls back to a school fixture", async () => {
  const api = await fixture();
  try {
    const connection = await connect(api);
    const context = value(
      await connection.call(
        rpc("tools/call", { name: "home.list_capabilities", arguments: {} }),
      ),
    );
    assert.equal(context.household.id, "personal-day");
    assert.equal(context.devices.length, 0);
    const response = await connection.call(
      rpc("tools/call", {
        name: "routine.compile",
        arguments: { goal: "Read for 30 minutes at 18:00" },
      }),
    );
    assert.equal(response.result.isError, true);
    assert.equal(value(response).error.code, "LLM_NOT_CONFIGURED");
    assert.equal(api.repository.proposals.length, 0);
  } finally {
    await api.close();
  }
});

test("request planner performs arrival routing, verification and calendar export over MCP", async () => {
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const point = { label: "Public test address", latitude: 1, longitude: 2 };
  const planner = new PlannerService({
    model: "mock-gemini",
    async generate({ input }) {
      assert.ok(
        input.availableMcpTools.some((tool) => tool.name === "journey.plan"),
      );
      return {
        kind: "journey",
        goal: "Arrive at the selected place by 10:00",
        explanation: "Plan the arrival",
        questions: [],
        arrivalTime: "10:00",
        tasks: [{ label: "Pack a bag", durationMinutes: 10 }],
        selectedTools: ["journey.plan"],
      };
    },
  });
  const calls = [];
  const environment = {
    async traffic(input) {
      calls.push("route");
      assert.equal(input.arriveAt, `${date}T10:00:00.000Z`);
      return {
        provider: "TomTom",
        travelMinutes: 30,
        delayMinutes: 5,
        retrievedAt: new Date().toISOString(),
      };
    },
    async weather(input) {
      calls.push("weather");
      return {
        provider: "Open-Meteo",
        timezone: "UTC",
        raining: false,
        temperatureC: 20,
        precipitationMm: 0,
        validFor: `${date}T${input.time}`,
        retrievedAt: new Date().toISOString(),
      };
    },
  };
  const api = await fixture({ planner, environment });
  try {
    const connection = await connect(api);
    const invoke = async (name, args) =>
      value(
        await connection.call(rpc("tools/call", { name, arguments: args })),
      );
    const result = await invoke("planner.respond", {
      message:
        "Arrive at the selected place by ten and pack a bag for ten minutes",
      context: { date, timezone: "UTC", origin: point, destination: point },
    });
    assert.equal(result.simulation.status, "PASSED");
    assert.equal(result.proposal.routine.journey.departureTime, "09:20");
    assert.equal(result.proposal.routine.journey.readyTime, "08:50");
    assert.equal(calls.filter((call) => call === "route").length, 1);
    const originalVersion = result.proposal.version;
    const branch = await invoke("simulation.what_if", {
      proposalId: result.proposal.id,
      delayMinutes: 15,
    });
    assert.equal(branch.hypothetical, true);
    assert.equal(
      (await invoke("routine.get_status", { proposalId: result.proposal.id }))
        .proposal.version,
      originalVersion,
    );
    assert.match(
      (await invoke("reminder.export", { proposalId: result.proposal.id }))
        .content,
      /BEGIN:VALARM/,
    );
    const invalid = await connection.call(
      rpc("tools/call", {
        name: "journey.plan",
        arguments: { goal: "Missing locations" },
      }),
    );
    assert.ok(invalid.error || invalid.result?.isError);
    assert.equal(api.repository.activations.length, 0);
    const compared = await invoke("rehearsal.compare", {
      proposalId: result.proposal.id,
      scenario: { extraTravelMinutes: 15 },
    });
    assert.equal(compared.unchanged.status, "FAILED");
    const combined = await invoke("rehearsal.compare", {
      proposalId: result.proposal.id,
      scenario: {
        events: [
          { type: "TRAVEL_DELAY", minutes: 15 },
          { type: "RAIN", raining: true },
          { type: "TASK_ALLOWANCE", stepId: "prepare-1", minutes: 10 },
        ],
      },
    });
    assert.equal(combined.appliedEvents.length, 3);
    assert.equal(combined.options[0].routine.journey.readyTime, "08:15");
    assert.equal(calls.filter((call) => call === "route").length, 1);
    assert.equal(
      (await invoke("routine.get_status", { proposalId: result.proposal.id }))
        .proposal.version,
      originalVersion,
    );
    const unsupported = await connection.call(
      rpc("tools/call", {
        name: "rehearsal.compare",
        arguments: {
          proposalId: result.proposal.id,
          scenario: { events: [{ type: "POLICY_OVERRIDE" }] },
        },
      }),
    );
    assert.ok(unsupported.error || unsupported.result?.isError);
    assert.equal(
      compared.options.filter((option) => option.feasible).length,
      2,
    );
    const accepted = await invoke("rehearsal.adopt", {
      proposalId: result.proposal.id,
      expectedVersion: originalVersion,
      scenario: compared.scenario,
      choice: "EARLIER_PREPARATION",
      confirmed: true,
    });
    assert.equal(accepted.proposal.routine.journey.readyTime, "08:35");
    assert.equal(
      accepted.proposal.routine.lineage.parentProposalId,
      result.proposal.id,
    );
    assert.equal((await invoke("routine.list", {})).plans.length, 2);
    assert.equal(
      (await invoke("routine.get_status", { proposalId: accepted.proposal.id }))
        .simulation.status,
      "PASSED",
    );
    assert.equal(api.repository.activations.length, 0);
  } finally {
    await api.close();
  }
});

test("conversational Gemini path uses the registered complete tool catalog over real MCP", async () => {
  let decisions = 0;
  let plans = 0;
  const planner = new PlannerService({
    model: "mock-gemini",
    async generate({ input }) {
      assert.equal(input.availableMcpTools.length, 26);
      assert.ok(
        input.availableMcpTools.find(
          (tool) => tool.name === "household.configure",
        ).inputSchema.properties.profile,
      );
      if (input.message) {
        decisions++;
        return {
          operation: "plan",
          reply: "I'll propose dinner preparation.",
          questions: [],
        };
      }
      plans++;
      return {
        title: "Dinner",
        explanation: "Proposed oven task",
        questions: [],
        assumptions: [],
        tasks: [{ request: "Cook dinner", stepIds: ["cook"] }],
        recommendedTools: ["simulation.run"],
        steps: [
          {
            id: "cook",
            label: "Cook dinner",
            targetId: "oven",
            capability: "cook",
            startMinute: 1080,
            durationMinutes: 30,
            optional: false,
            requiredForDeparture: false,
            departure: false,
            dependsOn: [],
          },
        ],
        taskDeadlines: [{ stepId: "cook", atMinute: 1140 }],
      };
    },
  });
  const api = await fixture({
    planner,
    environment: new EnvironmentProvider(),
  });
  try {
    const connection = await connect(api);
    const response = value(
      await connection.call(
        rpc("tools/call", {
          name: "assistant.respond",
          arguments: {
            message: "Cook dinner by 19:00",
            scenarioId: "evening-guests",
            dataMode: "fixture",
          },
        }),
      ),
    );
    assert.equal(response.selectedTool, "routine.compile");
    assert.equal(response.result.planner, "gemini");
    assert.equal(decisions, 1);
    assert.equal(plans, 1);
    const verification = value(
      await connection.call(
        rpc("tools/call", {
          name: "simulation.run",
          arguments: { proposalId: response.result.proposal.id },
        }),
      ),
    );
    assert.equal(verification.simulation.status, "PASSED");
    const invalid = await connection.call(
      rpc("tools/call", {
        name: "weather.get_forecast",
        arguments: { latitude: 1000, longitude: 0 },
      }),
    );
    assert.ok(invalid.error || invalid.result?.isError);
    assert.equal(api.repository.activations.length, 0);
  } finally {
    await api.close();
  }
});

test("origin and host validation reject cross-site MCP and demo-token requests", async () => {
  const api = await fixture();
  try {
    const evil = await fetch(`${api.baseUrl}/demo/session`, {
      method: "POST",
      headers: {
        origin: "https://untrusted.example",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(evil.status, 403);
    const invalidHostStatus = await new Promise((resolve, reject) => {
      http
        .get(
          `${api.baseUrl}/health`,
          { headers: { host: "untrusted.example" } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        )
        .on("error", reject);
    });
    assert.equal(invalidHostStatus, 403);
    assert.equal((await fetch(`${api.baseUrl}/metrics`)).status, 401);
  } finally {
    await api.close();
  }
});

test("MCP session belongs to its authenticated user and client", async () => {
  const api = await fixture();
  try {
    const owner = api.tokenService.issue({
      userId: "owner",
      scopes: ["mcp:tools"],
    });
    const initial = await request(
      api.baseUrl,
      owner,
      rpc("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      }),
    );
    const session = initial.headers.get("mcp-session-id");
    const stranger = api.tokenService.issue({
      userId: "stranger",
      scopes: ["mcp:tools"],
    });
    const denied = await request(
      api.baseUrl,
      stranger,
      rpc("tools/list", {}),
      session,
    );
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error, "session_owner_mismatch");
  } finally {
    await api.close();
  }
});

test("unified dayboard, health, legacy entry and demo session are served", async () => {
  const api = await fixture();
  try {
    const page = await fetch(api.baseUrl);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Plan a day that works/);
    assert.match(html, /workspace\/app.js/);
    for (const view of [
      "plan",
      "rehearse",
      "saved",
      "household",
      "connections",
    ])
      assert.match(html, new RegExp(`id="view-${view}"`));
    const legacy = await fetch(`${api.baseUrl}/lab.html`).then((response) =>
      response.text(),
    );
    assert.match(legacy, /url=\/\?view=rehearse/);
    const health = await fetch(`${api.baseUrl}/health`).then((response) =>
      response.json(),
    );
    assert.equal(health.protocolVersion, "2025-11-25");
    const session = await fetch(`${api.baseUrl}/demo/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(session.status, 200);
    assert.ok((await session.json()).accessToken);
  } finally {
    await api.close();
  }
});

test("MCP initializes with 2025-11-25 and exposes only Rehearse tools", async () => {
  const api = await fixture();
  try {
    const connection = await connect(api);
    const listed = await connection.call(rpc("tools/list", {}));
    const names = listed.result.tools.map((tool) => tool.name);
    assert.ok(names.includes("routine.compile"));
    assert.ok(names.includes("simulation.run"));
    assert.ok(names.includes("routine.rollback"));
    assert.ok(!names.some((name) => name.startsWith("lifeops.")));
  } finally {
    await api.close();
  }
});

test("MCP completes the compile, repair, revision, and approval path", async () => {
  const api = await fixture();
  try {
    const connection = await connect(api);
    const invoke = async (name, args) =>
      value(
        await connection.call(rpc("tools/call", { name, arguments: args })),
      );
    const goal =
      "Make our school mornings run themselves. Leave by 7:45, don't wake the baby before 7, don't run the kettle and water heater together, and leave 15 minutes earlier when it rains.";
    const compiled = await invoke("routine.compile", {
      goal,
      mode: "fixture",
      scenarioId: "school-morning",
    });
    const proposalId = compiled.proposal.id;
    const verification = await invoke("simulation.run", { proposalId });
    assert.equal(verification.simulation.status, "FAILED");
    assert.equal(verification.proposal.status, "NEEDS_REPAIR");
    assert.equal(
      (await invoke("routine.repair", { proposalId })).status,
      "NEEDS_INPUT",
    );
    assert.equal(
      (
        await invoke("routine.revise", {
          proposalId,
          instruction: "On Fridays, Maya can wake at 6:50",
        })
      ).simulation.status,
      "PASSED",
    );
    const approval = await invoke("routine.request_activation", { proposalId });
    const activation = await invoke("routine.activate", {
      proposalId,
      approvalId: approval.approval.id,
      confirmed: true,
      idempotencyKey: "mcp-demo-001",
    });
    assert.equal(activation.activation.status, "ACTIVE");
  } finally {
    await api.close();
  }
});

test("missing tokens are rejected and wrong scope becomes a safe tool error", async () => {
  const api = await fixture();
  try {
    const missing = await fetch(`${api.baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rpc("initialize", {})),
    });
    assert.equal(missing.status, 401);
    const token = api.tokenService.issue({
      userId: "demo-user",
      scopes: ["mcp:resources"],
    });
    const connection = await connect(api, token);
    const response = await connection.call(
      rpc("tools/call", { name: "home.list_capabilities", arguments: {} }),
    );
    assert.equal(response.result.isError, true);
    assert.equal(value(response).error.code, "INSUFFICIENT_SCOPE");
  } finally {
    await api.close();
  }
});

test("OAuth still enforces client credentials and PKCE S256", async () => {
  const api = await fixture();
  try {
    api.config.oauthClients = [
      {
        id: "test-client",
        secret: "test:secret",
        redirectUris: ["https://client.example/callback"],
      },
    ];
    const basic = `Basic ${Buffer.from("test-client:test:secret").toString("base64")}`;
    const verifier = "a-very-long-pkce-verifier-for-test-123456789";
    const challenge = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");
    const authorize = new URL(`${api.baseUrl}/oauth/authorize`);
    authorize.search = new URLSearchParams({
      response_type: "code",
      client_id: "test-client",
      redirect_uri: "https://client.example/callback",
      resource: "http://127.0.0.1:0/mcp",
      scope: "mcp:tools",
      code_challenge_method: "S256",
      code_challenge: challenge,
      demo_user: "demo-user",
      approved: "true",
    });
    const response = await fetch(authorize, { redirect: "manual" });
    const code = new URL(response.headers.get("location")).searchParams.get(
      "code",
    );
    const exchange = await fetch(`${api.baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        authorization: basic,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://client.example/callback",
        resource: "http://127.0.0.1:0/mcp",
        code_verifier: verifier,
      }),
    });
    assert.equal(exchange.status, 200);
    assert.equal((await exchange.json()).scope, "mcp:tools");
  } finally {
    await api.close();
  }
});

async function fixture(overrides = {}) {
  const instance = await createApplication({
    ...overrides,
    config: {
      publicUrl: "http://127.0.0.1:0",
      repositoryMode: "memory",
      demoMode: true,
      authRequired: true,
      requestLimit: 1000,
      geminiApiKey: undefined,
      trafficApiKey: undefined,
    },
  });
  const listener = await new Promise((resolve) => {
    const server = instance.app.listen(0, "127.0.0.1", () => resolve(server));
  });
  const baseUrl = `http://127.0.0.1:${listener.address().port}`;
  return {
    ...instance,
    baseUrl,
    async close() {
      await new Promise((resolve) => listener.close(resolve));
      await instance.close();
    },
  };
}
async function connect(api, suppliedToken) {
  const token =
    suppliedToken ??
    api.tokenService.issue({ userId: "demo-user", scopes: ["mcp:tools"] });
  const initial = await request(
    api.baseUrl,
    token,
    rpc("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    }),
  );
  const session = initial.headers.get("mcp-session-id");
  await request(
    api.baseUrl,
    token,
    { jsonrpc: "2.0", method: "notifications/initialized" },
    session,
  );
  return {
    call: (body) =>
      request(api.baseUrl, token, body, session).then((response) =>
        response.json(),
      ),
  };
}
function request(baseUrl, token, body, session) {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      ...(session ? { "mcp-session-id": session } : {}),
    },
    body: JSON.stringify(body),
  });
}
function rpc(method, params, id = crypto.randomUUID()) {
  return { jsonrpc: "2.0", id, method, params };
}
function value(message) {
  return (
    message.result.structuredContent ??
    JSON.parse(message.result.content[0].text)
  );
}
