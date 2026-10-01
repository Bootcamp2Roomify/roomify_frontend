import { createServer, ViteDevServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let serverInstance: ViteDevServer | null = null;

export async function startHarnessServer(port = 3181): Promise<ViteDevServer> {
  if (serverInstance) return serverInstance;

  serverInstance = await createServer({
    configFile: path.resolve(__dirname, "vite.config.ts"),
    server: {
      port,
      host: "127.0.0.1",
    },
  });

  await serverInstance.listen();
  return serverInstance;
}

export async function stopHarnessServer(): Promise<void> {
  if (serverInstance) {
    await serverInstance.close();
    serverInstance = null;
  }
}
