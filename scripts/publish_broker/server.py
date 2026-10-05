"""Unix-socket server. One newline-terminated JSON request per connection, one JSON response.

Access control is the kernel's view of the peer (LOCAL_PEERCRED on macOS, SO_PEERCRED on Linux), checked against
`allowed_uids`, in addition to the socket's file mode. Run as the broker user, e.g. from a LaunchDaemon with UserName.

  python -m scripts.publish_broker.server --config /Users/mediumpub/etc/broker.json
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import stat
import struct
import sys
import threading
from pathlib import Path

from .broker import Broker
from .config import BrokerConfig
from .runner import SubprocessRunner
from .schema import MAX_REQUEST_BYTES, err

READ_TIMEOUT_S = 10.0
_SOL_LOCAL, _LOCAL_PEERCRED = 0, 0x001  # <sys/un.h>, macOS/BSD


def peer_uid(conn: socket.socket) -> int | None:
    try:
        if sys.platform == "darwin":
            buf = conn.getsockopt(_SOL_LOCAL, _LOCAL_PEERCRED, struct.calcsize("=IIh2x16I"))  # struct xucred
            return struct.unpack_from("=II", buf)[1]  # (cr_version, cr_uid)
        buf = conn.getsockopt(socket.SOL_SOCKET, getattr(socket, "SO_PEERCRED", 17), struct.calcsize("3i"))
        return struct.unpack("3i", buf)[1]  # (pid, uid, gid)
    except (OSError, struct.error):
        return None


def read_line(conn: socket.socket) -> bytes:
    conn.settimeout(READ_TIMEOUT_S)
    data = b""
    while b"\n" not in data and len(data) <= MAX_REQUEST_BYTES:
        chunk = conn.recv(4096)
        if not chunk:
            break
        data += chunk
    return data.split(b"\n", 1)[0] if b"\n" in data else data


class Server:
    def __init__(self, broker: Broker, socket_path: Path) -> None:
        self.broker, self.path = broker, Path(socket_path)
        self.lock = threading.Lock()  # authorize/publish are serialized: one evaluator run at a time
        self.sock: socket.socket | None = None

    def bind(self) -> None:
        if self.path.exists() or self.path.is_symlink():
            if not stat.S_ISSOCK(os.lstat(self.path).st_mode):
                raise OSError(f"{self.path} exists and is not a socket")
            probe = socket.socket(socket.AF_UNIX)
            try:
                probe.connect(str(self.path))
            except OSError:
                self.path.unlink()  # stale
            else:
                raise OSError(f"{self.path}: another broker is already listening")
            finally:
                probe.close()
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        old = os.umask(0o117)  # created 0660; the directory's group decides who can even reach it
        try:
            self.sock.bind(str(self.path))
        finally:
            os.umask(old)
        self.sock.listen(8)

    def serve_one(self) -> None:
        assert self.sock is not None
        conn, _ = self.sock.accept()
        threading.Thread(target=self._handle, args=(conn,), daemon=True).start()

    def serve_forever(self) -> None:
        while True:
            self.serve_one()

    def _handle(self, conn: socket.socket) -> None:
        with conn:
            try:
                uid = peer_uid(conn)
                raw = read_line(conn)
                with self.lock:
                    resp = self.broker.handle_raw(raw, uid)
            except (OSError, TimeoutError):
                resp = err("io_error", "connection failed or timed out")
            try:
                conn.sendall(json.dumps(resp).encode() + b"\n")
            except OSError:
                pass


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True, type=Path)
    cfg = BrokerConfig.load(ap.parse_args(argv).config)
    runner = SubprocessRunner(cfg.pinned_checkout, cfg.python_cmd, cfg.store_dir / "keys" / "eval.key", cfg.pass_env)
    srv = Server(Broker(cfg, runner), cfg.socket_path)
    srv.bind()
    print(f"publish broker listening on {cfg.socket_path} (uids {list(cfg.allowed_uids)}, ceiling {cfg.max_action}, dry-run executor)", flush=True)
    srv.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
