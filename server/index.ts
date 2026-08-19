import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleReaAssistant } from "./routes/rea-assistant";
import { createReaSession, deleteReaSession } from "./routes/rea-session";

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
  app.post("/api/rea-assistant", handleReaAssistant);
  app.post("/api/auth/rea-session", createReaSession);
  app.delete("/api/auth/rea-session", deleteReaSession);

  return app;
}
