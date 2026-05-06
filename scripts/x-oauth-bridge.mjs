import http from "node:http";

const host = process.env.X_OAUTH_BRIDGE_HOST || "127.0.0.1";
const port = Number(process.env.X_OAUTH_BRIDGE_PORT || 3001);
const target =
  process.env.X_OAUTH_BRIDGE_TARGET ||
  "https://127.0.0.1:3000/api/auth/callback";

const server = http.createServer((request, response) => {
  const source = new URL(request.url || "/", `http://${host}:${port}`);

  if (source.pathname !== "/api/auth/callback") {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const destination = new URL(target);
  destination.search = source.search;

  response.writeHead(307, {
    location: destination.toString(),
    "cache-control": "no-store",
  });
  response.end();
});

server.listen(port, host, () => {
  console.log(
    `[x-oauth-bridge] listening on http://${host}:${port}/api/auth/callback -> ${target}`
  );
});
