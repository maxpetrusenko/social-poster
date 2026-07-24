#!/usr/bin/env node
import { randomUUID } from "node:crypto";

function usage() {
  console.error(`Usage:
  node scripts/notify-matrix.mjs --message "text"
  node scripts/notify-matrix.mjs --file /path/message.txt

Required env:
  MATRIX_HOMESERVER_URL
  MATRIX_ACCESS_TOKEN
  MATRIX_ROOM_ID`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--message") {
      args.message = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--file") {
      args.file = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown arg: ${arg}`);
    }
  }
  return args;
}

async function readMessage(args) {
  if (args.message) return args.message;
  if (args.file) {
    const fs = await import("node:fs/promises");
    return fs.readFile(args.file, "utf8");
  }
  return "";
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const message = (await readMessage(args)).trim();
  if (!message) {
    usage();
    throw new Error("Message is empty");
  }

  const homeserver = requiredEnv("MATRIX_HOMESERVER_URL").replace(/\/$/, "");
  const token = requiredEnv("MATRIX_ACCESS_TOKEN");
  const roomId = requiredEnv("MATRIX_ROOM_ID");
  const encodedRoomId = encodeURIComponent(roomId);
  const txId = `social-poster-${Date.now()}-${randomUUID()}`;
  const url = `${homeserver}/_matrix/client/v3/rooms/${encodedRoomId}/send/m.room.message/${txId}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      msgtype: "m.text",
      body: message,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Matrix notification failed: ${response.status} ${text.slice(0, 300)}`);
  }

  console.log("sent matrix notification");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
