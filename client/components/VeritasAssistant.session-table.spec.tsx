import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InspectionWorkflowProvider } from "../lib/inspection-workflow";
import VeritasAssistant from "./VeritasAssistant";

describe("Veritas structured session table", () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "One of two registered users has recorded login history.",
        table: {
          caption: "User session activity",
          columns: ["User", "Latest login (WAT)", "Device"],
          rows: [
            ["REA Administrator", "16 Sep 2026, 10:30 WAT", "Desktop · Chrome · Windows"],
            ["Amina Yusuf", "Not recorded", "Not recorded"],
          ],
        },
        note: "Duration is an observed session span.",
      }),
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders every returned user in an accessible responsive table", async () => {
    render(
      <InspectionWorkflowProvider>
        <VeritasAssistant />
      </InspectionWorkflowProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /open veritas/i }));
    fireEvent.change(screen.getByLabelText("Ask Veritas a question"), {
      target: { value: "Show every user's latest login and device" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question to Veritas" }));

    const table = await screen.findByRole("table", { name: "User session activity" });
    expect(screen.getByRole("columnheader", { name: "Latest login (WAT)" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "REA Administrator" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Amina Yusuf" })).toBeTruthy();
    expect(table.parentElement?.className).toContain("overflow-x-auto");
    expect(screen.getByText("Duration is an observed session span.")).toBeTruthy();
  });
});
