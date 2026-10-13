"""Execute allowlisted cases in disposable, loopback-only REAL Home Assistant.

No existing HA configuration, credentials, or physical devices are used.
JSON reports contain observed states/events, never authentication tokens.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import socket
import tempfile

import aiohttp
import yaml
from homeassistant import bootstrap, loader
from homeassistant.core import HomeAssistant
from homeassistant.const import __version__


def validate_case(case):
    for entity in case["entities"]:
        if not entity.startswith("input_boolean."):
            raise ValueError("Testbed permits input_boolean virtual entities only")
    for rule in case["rules"]:
        for action in rule["actions"]:
            if "action" in action:
                if action["action"] not in ("input_boolean.turn_on", "input_boolean.turn_off"):
                    raise ValueError("Testbed action outside allowlist")
                targets = action["target"]["entity_id"]
                for target in targets if isinstance(targets, list) else [targets]:
                    if target not in case["entities"]:
                        raise ValueError("Unknown target")
            elif not ("delay" in action or action.get("condition") == "state"):
                raise ValueError("Unsupported testbed action")


async def execute(case):
    validate_case(case)
    with tempfile.TemporaryDirectory(prefix="rehearse-ha-") as temporary:
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        configuration = {
            "homeassistant": {"name": "Rehearse isolated testbed", "time_zone": "UTC", "latitude": 0, "longitude": 0, "elevation": 0, "unit_system": "metric"},
            "http": {"server_host": "127.0.0.1", "server_port": port},
            "api": {}, "websocket_api": {},
            "input_boolean": {key.split(".")[1]: {"name": key, "initial": value["state"] == "on"} for key, value in case["entities"].items()},
            "automation": case["rules"],
        }
        Path(temporary, "configuration.yaml").write_text(yaml.safe_dump(configuration), encoding="utf8")
        hass = HomeAssistant(temporary)
        loader.async_setup(hass)
        if await bootstrap.async_from_config_dict(configuration, hass) is None:
            raise RuntimeError("Home Assistant setup failed")
        try:
            await hass.async_start()
            await hass.async_block_till_done()
            for key in case["entities"]:
                if hass.states.get(key) is None:
                    raise AssertionError(f"Missing testbed entity {key}")
            user = await hass.auth.async_create_user("Rehearse ephemeral test", group_ids=["system-admin"])
            refresh = await hass.auth.async_create_refresh_token(user, client_id="http://localhost")
            token = hass.auth.async_create_access_token(refresh)
            base = f"http://127.0.0.1:{port}"
            observed = []
            loop = asyncio.get_running_loop()
            start = loop.time()
            async with aiohttp.ClientSession(headers={"Authorization": f"Bearer {token}"}) as client:
                async with client.ws_connect(base + "/api/websocket") as ws:
                    assert (await ws.receive_json())["type"] == "auth_required"
                    await ws.send_json({"type": "auth", "access_token": token})
                    assert (await ws.receive_json())["type"] == "auth_ok"
                    await ws.send_json({"id": 1, "type": "subscribe_events", "event_type": "state_changed"})
                    assert (await ws.receive_json())["success"]
                    async def collect():
                        async for message in ws:
                            if message.type != aiohttp.WSMsgType.TEXT:
                                continue
                            packet = json.loads(message.data)
                            event = packet.get("event", {})
                            data = event.get("data", {})
                            if data.get("entity_id") in case["entities"] and data.get("new_state"):
                                observed.append({"at": round((loop.time() - start) * 1000), "entityId": data["entity_id"], "state": data["new_state"]["state"], "hasContext": bool(event.get("context", {}).get("id"))})
                    listener = asyncio.create_task(collect())
                    start = loop.time()
                    for event in sorted(case["events"], key=lambda e: e["at"]):
                        await asyncio.sleep(max(0, event["at"] / 1000 - (loop.time() - start)))
                        if event["kind"] == "state":
                            if event["entityId"] not in case["entities"] or event["state"] not in ("on", "off"):
                                raise ValueError("Invalid test event")
                            endpoint = "/api/services/input_boolean/turn_" + event["state"]
                            body = {"entity_id": event["entityId"]}
                        else:
                            if not event["eventType"].startswith("rehearse_"):
                                raise ValueError("Test events require rehearse_ prefix")
                            endpoint = "/api/events/" + event["eventType"]
                            body = event.get("data", {})
                        async with client.post(base + endpoint, json=body) as response:
                            response.raise_for_status()
                            await response.read()
                    await asyncio.sleep(max(0.1, case["until"] / 1000 - (loop.time() - start)))
                    # Snapshot at the declared horizon. Waiting for ALL HA tasks here
                    # also waits for delayed automations and changes the experiment.
                    async with client.get(base + "/api/states") as response:
                        response.raise_for_status()
                        states = {s["entity_id"]: s["state"] for s in await response.json() if s["entity_id"] in case["entities"]}
                    await ws.close()
                    await listener
            for key, expected in case.get("expected", {}).items():
                if states.get(key) != expected:
                    raise AssertionError(f'{case["id"]}: {key} expected {expected}, observed {states.get(key)}')
            if not observed:
                raise AssertionError("No authenticated WebSocket events captured")
            return {"id": case["id"], "inputHash": case.get("inputHash"), "finalStates": states, "events": observed, "assertionsPassed": True, "restRead": True, "authenticatedWebSocket": True}
        finally:
            await hass.async_stop()


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("cases")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if __version__ != "2024.12.5":
        raise RuntimeError("Conformance requires pinned HA 2024.12.5")
    cases = json.loads(Path(args.cases).read_text(encoding="utf8"))
    results = []
    for case in cases:
        results.append(await execute(case))
        print(f'PASS {case["id"]}', flush=True)
    report = {"runtime": "Home Assistant Core", "version": __version__, "devices": "virtual input_boolean helpers", "recordedAt": datetime.now(timezone.utc).isoformat(), "cases": results}
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print(f"Validated {len(results)} cases; report saved (no credentials).", flush=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.ERROR)
    asyncio.run(main())
