# Independent Home Assistant conformance testbed

This harness boots actual Home Assistant Core in a fresh temporary directory for each case. It creates only virtual boolean helpers, binds HTTP to loopback on an unused port, creates an ephemeral test user/token, performs authenticated REST calls and captures authenticated WebSocket events. Each instance is stopped and its temporary configuration is removed after the case. Existing HA installations are never used. Credentials remain in memory/temporary storage and are not in the JSON report.

Reference: HA **2024.12.5**, Python **3.12**, historical dependency cutoff **2025-02-01**. This is an isolated test dependency, not a supported production installation recommendation. Current HA compatibility is not implied.

In WSL/Linux, create an isolated environment (the path below is an example):

```bash
python3 -m venv /tmp/rehearse-ha-2024.12.5
/tmp/rehearse-ha-2024.12.5/bin/pip install uv
/tmp/rehearse-ha-2024.12.5/bin/uv pip install --python /tmp/rehearse-ha-2024.12.5/bin/python --exclude-newer 2025-02-01 -r automation/testbed/requirements.txt
```

From the repository root in PowerShell:

```powershell
node apps/mcp-server/scripts/haCases.js
wsl -d Ubuntu -- /tmp/rehearse-ha-2024.12.5/bin/python /mnt/c/Users/shrin/OneDrive/Desktop/alexa_plus/automation/testbed/run_ha.py /mnt/c/Users/shrin/OneDrive/Desktop/alexa_plus/artifacts/automation/ha-cases.json --output /mnt/c/Users/shrin/OneDrive/Desktop/alexa_plus/artifacts/automation/ha-observed.json
```

Adjust the repository path to your checkout. Linux users can call the Python executable directly. Generated inputs and observations go into ignored `artifacts/automation/`. Sanitized, reviewed observations may be copied into the tracked phase evidence by the report workflow.

For repeated work, use a persistent user-owned venv instead of `/tmp` (which is cleared on restart). This checkout's validation used `/home/soham/.local/share/rehearse-ha-2024.12.5`. After generating a phase-2 capture, run `node apps/mcp-server/scripts/compareHa.js <capture.json>` to compare independent expectations, input hashes, and observed state-change sequences with the pure interpreter.

The checks assert independently specified expected final states. Events include elapsed wall time for inspection, not exact timing guarantees. This tests actual HA software with virtual entities; it is not evidence of physical-device effects. Do not substitute production-household credentials or targets into this harness.
