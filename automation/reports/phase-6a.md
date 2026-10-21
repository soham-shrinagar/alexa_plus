# Phase 6A — the workshop is an actual MCP client

The browser now authenticates through the returning-account endpoint and sends every project operation through `/mcp`: initialize (2025-11-25), initialized notification, tool discovery, then tools/call. The same visible import, investigation, replay, repair and approved export now exercise the published MCP tools. Public example/guide/evidence and login remain ordinary HTTP routes.

The small browser client targets this server's JSON-response Streamable HTTP mode. It validates response IDs/version/session and tool errors. It reconnects once only when the server explicitly rejects a missing/expired transport before dispatch. It never automatically retries a write after a network failure, since that write might have committed. Authentication expiry returns the existing login flow. The service's one-use, version-bound approvals remain authoritative.

Verification: an integration test uses the actual browser client against a real local HTTP server, registering a disposable in-memory account, discovering tools, importing, preflighting, reviewing/exporting, rejecting reuse, reconnecting transport, and handling token expiry. A separate failure test verifies no replay after a dropped request and rejection of mismatched response IDs. No real user data or external services are used.

The official FAQ checked October 16, 2026 explicitly allows a web MCP client and states gated Alexa tools are unavailable to hackathon participants. This is a simulated Alexa+ experience with real MCP, not a native Alexa connection: https://amazonappdev2026.devpost.com/details/faqs .
