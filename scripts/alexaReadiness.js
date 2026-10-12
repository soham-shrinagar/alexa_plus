// Read-only check. Never installs Amazon tooling, creates an add-on, or deploys.
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const url = new URL(base);
if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
  throw new Error("Supply an HTTP(S) server base URL without credentials.");
async function get(path) {
  const response = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(`Readiness endpoint returned ${response.status}`);
  return response.json();
}
const [health, resource, auth] = await Promise.all([
  get("/health"),
  get("/.well-known/oauth-protected-resource"),
  get("/.well-known/oauth-authorization-server"),
]);
const unauthenticated = await fetch(`${base}/mcp`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "readiness", version: "1" },
    },
  }),
  signal: AbortSignal.timeout(10000),
});
console.log(
  JSON.stringify(
    {
      endpoint: `${base}/mcp`,
      checks: {
        remoteHttps:
          url.protocol === "https:" &&
          !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
        demoTokensDisabled: health.demoMode === false,
        declaredProtocol: health.protocolVersion,
        canonicalResourceMatches: resource.resource === `${base}/mcp`,
        pkceS256Advertised:
          auth.code_challenge_methods_supported?.includes("S256"),
        serviceGrantAdvertised:
          auth.grant_types_supported?.includes("client_credentials"),
        refreshGrantAdvertised:
          auth.grant_types_supported?.includes("refresh_token"),
        unauthenticatedStatus: unauthenticated.status,
        amazonPreviewChallengeCompatible:
          !unauthenticated.headers.has("www-authenticate"),
      },
      stillRequiresHumanOrImplementation: [
        "Amazon select-partner entitlement and authorized CLI access",
        "Real customer sign-in, consent and durable refresh-token lifecycle (demo auth is insufficient)",
        "Exact registered OAuth client and Amazon callback URLs",
        "Privacy/terms URLs and reviewed add-on assets/manifest",
        "Measure authenticated tool latency; synchronous LLM/provider calls do not meet Amazon's documented <500ms target",
        "Authorized Alexa Web Simulator/device account-linking and functional tests",
      ],
      connectedToAlexa: false,
    },
    null,
    2,
  ),
);
