import { createServer } from "node:net";

export async function findAvailableLocalPort(
  startPort = 8787,
): Promise<number> {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await canBindLocalPort(port)) {
      return port;
    }
  }
  throw new Error(`No available localhost port found starting at ${startPort}`);
}

function canBindLocalPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}
