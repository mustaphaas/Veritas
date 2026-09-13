import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InspectionWorkflowProvider } from "../lib/inspection-workflow";
import ReaConsultantsManagement from "./ReaConsultantsManagement";

const { createConsultantApi } = vi.hoisted(() => ({
  createConsultantApi: vi.fn(),
}));

vi.mock("../lib/field-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/field-api")>()),
  createConsultantApi,
}));

describe("REA consultant creation", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    createConsultantApi.mockReset();
  });

  it("shows a database creation error inside the open consultant dialog", async () => {
    createConsultantApi.mockRejectedValueOnce(
      new Error("The consultant email is already registered."),
    );

    render(
      <InspectionWorkflowProvider>
        <ReaConsultantsManagement />
      </InspectionWorkflowProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create Consultant" }));
    fireEvent.change(screen.getByPlaceholderText("Organization / firm name"), {
      target: { value: "North Star Verification Ltd" },
    });
    fireEvent.change(screen.getByPlaceholderText("Consultant Admin name"), {
      target: { value: "Amina Bello" },
    });
    fireEvent.change(screen.getByPlaceholderText("Admin email"), {
      target: { value: "amina@northstar.ng" },
    });
    fireEvent.change(screen.getByPlaceholderText("Engagement reference"), {
      target: { value: "REA/CONS/2026/100" },
    });
    fireEvent.click(screen.getByLabelText("Kano"));
    fireEvent.click(
      screen.getByRole("button", { name: "Save Consultant & Dashboard" }),
    );

    const message = await screen.findByText(
      "The consultant email is already registered.",
    );
    await waitFor(() => expect(createConsultantApi).toHaveBeenCalledOnce());
    expect(message.closest(".fixed")).not.toBeNull();
  });
});
