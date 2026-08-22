import type { RequestHandler } from "express";
import {
  clearVeritasSessionCookie,
  createVeritasSessionToken,
  VERITAS_REA_EMAIL,
  VERITAS_REA_PASSWORD,
  veritasSessionCookie,
} from "../../shared/veritas-server-auth";

export const createVeritasSession: RequestHandler = async (req, res) => {
  const secret = process.env.REA_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    res.status(503).json({
      error: "Veritas server authentication is not configured.",
    });
    return;
  }

  if (
    String(req.body?.email ?? "")
      .trim()
      .toLowerCase() !== VERITAS_REA_EMAIL ||
    req.body?.password !== VERITAS_REA_PASSWORD
  ) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const token = await createVeritasSessionToken(secret, VERITAS_REA_EMAIL);
  res.setHeader(
    "Set-Cookie",
    veritasSessionCookie(token, process.env.NODE_ENV === "production"),
  );
  res.status(200).json({ ok: true });
};

export const deleteVeritasSession: RequestHandler = (_req, res) => {
  res.setHeader(
    "Set-Cookie",
    clearVeritasSessionCookie(process.env.NODE_ENV === "production"),
  );
  res.status(200).json({ ok: true });
};
