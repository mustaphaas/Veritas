import { describe, expect, it, vi } from "vitest";
import { answerReaQuestion } from "./rea-ai";

const validRequest = {
  messages: [
    { role: "user" as const, content: "How many projects are there?" },
  ],
  databaseContext: { portfolio: { totalProjects: 57 } },
};

describe("REA AI server handler", () => {
  it("requires a server-side API key", async () => {
    const result = await answerReaQuestion(validRequest, {});
    expect(result.status).toBe(503);
    expect(result.body.error).toContain("OPENAI_API_KEY");
  });

  it("rejects an empty conversation", async () => {
    const result = await answerReaQuestion(
      { messages: [], databaseContext: {} },
      { OPENAI_API_KEY: "test-key" },
    );
    expect(result.status).toBe(400);
  });

  it("returns grounded answer text and official REA sources", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: "The filtered dashboard contains 57 projects.",
                    annotations: [],
                  },
                ],
              },
              {
                type: "web_search_call",
                action: {
                  sources: [
                    {
                      title: "Rural Electrification Agency",
                      url: "https://rea.gov.ng/",
                    },
                    {
                      title: "Unapproved source",
                      url: "https://example.com/",
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as typeof fetch;

    const result = await answerReaQuestion(
      validRequest,
      { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
      fetcher,
    );

    expect(result.status).toBe(200);
    expect(result.body.answer).toContain("57 projects");
    expect(result.body.sources).toEqual([
      {
        title: "Rural Electrification Agency",
        url: "https://rea.gov.ng/",
      },
    ]);
    const requestBody = JSON.parse(
      String((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body),
    );
    expect(requestBody.store).toBe(false);
    expect(requestBody.tools[0].filters.allowed_domains).toEqual([
      "rea.gov.ng",
    ]);
  });
});
