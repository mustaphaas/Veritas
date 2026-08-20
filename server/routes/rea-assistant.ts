import type { RequestHandler } from "express";
import { answerReaQuestion, type ReaAiRequest } from "../../shared/rea-ai";
import {
  cookieValue,
  verifyReaSessionToken,
} from "../../shared/rea-server-auth";

export const handleReaAssistant: RequestHandler = async (req, res) => {
  const authenticated = await verifyReaSessionToken(
    cookieValue(req.header("cookie")),
    process.env.REA_AUTH_SECRET,
  );
  if (!authenticated) {
    res.status(401).json({ error: "REA access is required." });
    return;
  }
  try {
    const result = await answerReaQuestion(req.body as ReaAiRequest, {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
    });
    res.status(result.status).json(result.body);
  } catch {
    res
      .status(500)
      .json({ error: "Ask Veritas could not complete the request." });
  }
};
