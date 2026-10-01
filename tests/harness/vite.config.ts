import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const standardSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect fill="#cbd5e1" width="1200" height="800"/><text x="50%" y="50%" text-anchor="middle" fill="#475569" font-size="32">Room 1200x800</text></svg>';

const tallSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1600" viewBox="0 0 800 1600"><rect fill="#94a3b8" width="800" height="1600"/><text x="50%" y="50%" text-anchor="middle" fill="#1e293b" font-size="32">Tall 800x1600</text></svg>';

function fixtureRoutesPlugin(): Plugin {
  return {
    name: "fixture-routes",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/fixtures/")) {
          return next();
        }

        const url = new URL(req.url, "http://127.0.0.1:3181");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

        if (
          url.pathname === "/fixtures/room-1200x800.svg" ||
          url.pathname === "/fixtures/room-valid.svg"
        ) {
          res.setHeader("Content-Type", "image/svg+xml");
          res.statusCode = 200;
          res.end(standardSvg);
          return;
        }

        if (url.pathname === "/fixtures/room-delayed.svg") {
          const delay = parseInt(url.searchParams.get("delay") || "400", 10);
          setTimeout(() => {
            res.setHeader("Content-Type", "image/svg+xml");
            res.statusCode = 200;
            res.end(standardSvg);
          }, delay);
          return;
        }

        if (
          url.pathname === "/fixtures/room-tall-800x1600.svg" ||
          url.pathname === "/fixtures/room-mismatch.svg"
        ) {
          res.setHeader("Content-Type", "image/svg+xml");
          res.statusCode = 200;
          res.end(tallSvg);
          return;
        }

        if (url.pathname === "/fixtures/non-existent-404.jpg") {
          res.statusCode = 404;
          res.end("Not Found");
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), fixtureRoutesPlugin()],
  root: __dirname,
  server: {
    port: 3181,
    host: "127.0.0.1",
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
      "next/link": path.resolve(__dirname, "shims/next-link.tsx"),
      "next/navigation": path.resolve(__dirname, "shims/next-navigation.ts"),
    },
  },
  define: {
    "process.env": {},
  },
});
