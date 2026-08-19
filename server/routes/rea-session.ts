import type { RequestHandler } from "express";
import {
  clearReaSessionCookie,
  createReaSessionToken,
  REA_DEMO_EMAIL,
  REA_DEMO_PASSWORD,
  reaSessionCookie,
} from "../../shared/rea-server-auth";

export const createReaSession: RequestHandler = async (req, res) => {
  const secret = process.env.REA_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    res
      .status(503)
      .json({ error: "REA server authentication is not configured." });
    return;
  }
  if (
    String(req.body?.email ?? "")
      .trim()
      .toLowerCase() !== REA_DEMO_EMAIL ||
    req.body?.password !== REA_DEMO_PASSWORD
  ) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }
  const token = await createReaSessionToken(secret, REA_DEMO_EMAIL);
  res.setHeader(
    "Set-Cookie",
    reaSessionCookie(token, process.env.NODE_ENV === "production"),
  );
  res.status(200).json({ ok: true });
};

export const deleteReaSession: RequestHandler = (_req, res) => {
  res.setHeader(
    "Set-Cookie",
    clearReaSessionCookie(process.env.NODE_ENV === "production"),
  );
  res.status(200).json({ ok: true });
};
