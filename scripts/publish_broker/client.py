"""Client for the publish broker. By design it has no way to send article bytes: authorize takes a slug, publish takes
an auth id.

  python -m scripts.publish_broker.client --socket /var/run/mediumpub/broker.sock authorize --package <slug>
  python -m scripts.publish_broker.client --socket ... publish --auth-id <id> --action draft [--schedule-at ISO]
"""
from __future__ import annotations

import argparse
import json
import socket
import sys
from pathlib import Path

from .schema import PROTOCOL


def request(socket_path: Path | str, payload: dict, timeout: float = 3600.0) -> dict:
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        s.connect(str(socket_path))
        s.sendall(json.dumps({"v": PROTOCOL, **payload}).encode() + b"\n")
        buf = b""
        while b"\n" not in buf:
            chunk = s.recv(65536)
            if not chunk:
                break
            buf += chunk
    return json.loads(buf.split(b"\n", 1)[0])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--socket", required=True)
    sub = ap.add_subparsers(dest="op", required=True)
    sub.add_parser("status")
    a = sub.add_parser("authorize")
    a.add_argument("--package", required=True, help="package slug under the workspace articles dir")
    p = sub.add_parser("publish")
    p.add_argument("--auth-id", required=True)
    p.add_argument("--action", required=True, choices=["draft", "schedule", "publish"])
    p.add_argument("--schedule-at")
    p.add_argument("--no-dry-run", action="store_true", help="ask for a real publish (the prototype refuses)")
    n = ap.parse_args(argv)
    if n.op == "status":
        payload = {"op": "status"}
    elif n.op == "authorize":
        payload = {"op": "authorize", "package": n.package}
    else:
        payload = {"op": "publish", "auth_id": n.auth_id, "action": n.action, "dry_run": not n.no_dry_run}
        if n.schedule_at:
            payload["schedule_at"] = n.schedule_at
    resp = request(n.socket, payload)
    print(json.dumps(resp, indent=1))
    return 0 if resp.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
