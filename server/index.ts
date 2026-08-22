import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleVeritasAssistant } from "./routes/veritas-assistant";
import {
  createVeritasSession,
  deleteVeritasSession,
} from "./routes/veritas-session";

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "300kb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);
  app.post("/api/auth/veritas-session", createVeritasSession);
  app.delete("/api/auth/veritas-session", deleteVeritasSession);
  app.post("/api/veritas", handleVeritasAssistant);

  return app;
}
