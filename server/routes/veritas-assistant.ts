import type { RequestHandler } from "express";
import {
  answerVeritasQuestion,
  type VeritasRequest,
} from "../../shared/veritas-ai";
import {
  veritasCookieValue,
  verifyVeritasSessionToken,
} from "../../shared/veritas-server-auth";

export const handleVeritasAssistant: RequestHandler = async (req, res) => {
  const authenticated = await verifyVeritasSessionToken(
    veritasCookieValue(req.header("cookie")),
    process.env.REA_AUTH_SECRET,
  );

  if (!authenticated) {
    res.status(401).json({ error: "REA administrator access is required." });
    return;
  }

  try {
    const result = await answerVeritasQuestion(req.body as VeritasRequest, {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
    });
    res.status(result.status).json(result.body);
  } catch {
    res.status(500).json({ error: "Veritas could not complete the request." });
  }
};
