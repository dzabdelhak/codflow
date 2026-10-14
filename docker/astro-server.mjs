import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const { startServer } = await import(pathToFileURL(resolve(process.argv[2])).href);
const { server } = startServer();
let draining = false;

server.server.prependListener("request", (_req, res) => {
  if (draining) res.setHeader("Connection", "close");
});

function drain() {
  if (draining) return;
  draining = true;
  setTimeout(() => process.exit(1), 25_000).unref();
  server.server.close(() => process.exit(0));
  server.server.closeIdleConnections();
}

process.on("SIGTERM", drain);
process.on("SIGINT", drain);
