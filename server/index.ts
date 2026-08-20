import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";

// The REA assistant and session routes now live entirely in the D1-backed
// Cloudflare backend (functions/_lib/api.ts, shared by functions/api and
// worker/index.ts). This local Express server is only used for the Vite
// dev-server middleware and no longer proxies those routes - it previously
// imported ./routes/rea-assistant and ./routes/rea-session, which called
// into shared/rea-server-auth.ts. That module was intentionally removed
// when the Cloudflare backend replaced the old demo-cookie auth, but these
// two Express routes were left importing it, which broke `vite build` /
// `npm run build` entirely.

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  return app;
}
