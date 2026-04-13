#!/bin/sh

set -eu

bridge_port="${PORT:-3000}"
export PORT=3000

if [ "$bridge_port" != "3000" ]; then
  BRIDGE_PORT="$bridge_port" node <<'EOF' &
const net = require("net");

const listenPort = Number(process.env.BRIDGE_PORT || 3000);

net
  .createServer((src) => {
    const dst = net.connect(3000, "127.0.0.1");
    const close = () => {
      src.destroy();
      dst.destroy();
    };

    src.pipe(dst);
    dst.pipe(src);
    src.on("error", close);
    dst.on("error", close);
  })
  .listen(listenPort, "0.0.0.0");
EOF
fi

exec node server.js
