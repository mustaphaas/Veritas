import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConsultantCoverageMap, { pointInFeature } from "./ConsultantCoverageMap";
import type { InspectionAssignment } from "../lib/inspection-workflow";

const stateFeature = {
  type: "Feature" as const,
  properties: { NAME_1: "Kaduna" },
  geometry: {
    type: "Polygon" as const,
    coordinates: [[[6, 9], [9, 9], [9, 12], [6, 12], [6, 9]]],
  },
};

const lgaFeature = {
  type: "Feature" as const,
  properties: { name: "Igabi" },
  geometry: {
    type: "Polygon" as const,
    coordinates: [[[7, 10], [8, 10], [8, 11], [7, 11], [7, 10]]],
  },
};

const assignment = {
  id: "assignment-1",
  projectName: "Rigachikun Mini Grid",
  programme: "DARES",
  component: "Mini Grid",
  contractor: "Northlight",
  state: "Kaduna",
  lga: "Wrong stored LGA",
  community: "Rigachikun",
  latitude: 10.5,
  longitude: 7.5,
  geofenceRadius: 250,
  officer: "Amina Yusuf",
  dueDate: "2026-10-10",
  status: "Assigned",
  syncStatus: "synced",
  audit: [],
} as InspectionAssignment;

describe("ConsultantCoverageMap", () => {
  beforeEach(() => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ features: [stateFeature] }) })
      .mockResolvedValueOnce({ json: async () => ({ features: [lgaFeature] }) });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses polygon containment rather than the stored LGA label", () => {
    expect(pointInFeature([7.5, 10.5], lgaFeature)).toBe(true);
    expect(pointInFeature([8.5, 10.5], lgaFeature)).toBe(false);
  });

  it("renders Esri coverage and selects a project from the consultant portfolio", async () => {
    render(
      <ConsultantCoverageMap
        assignments={[assignment]}
        filters={{
          programme: "All Programmes",
          state: "All States",
          officer: "All Field Officers",
        }}
      />,
    );

    expect(await screen.findByTestId("consultant-esri-map")).toBeTruthy();

    fireEvent.click(screen.getByTestId("consultant-map-project-assignment-1"));

    await waitFor(() => {
      expect(screen.getByTestId("consultant-map-project-details").textContent).toContain(
        "Rigachikun Mini Grid",
      );
      expect(screen.getByTestId("consultant-map-project-details").textContent).toContain("Igabi");
      expect(screen.getByTestId("consultant-map-project-details").textContent).not.toContain(
        "Wrong stored LGA",
      );
    });

    expect(screen.getByText("Igabi · Project locations")).toBeTruthy();
  });

  it("applies filters passed through React props", async () => {
    render(
      <ConsultantCoverageMap
        assignments={[assignment]}
        filters={{
          programme: "NEP",
          state: "All States",
          officer: "All Field Officers",
        }}
      />,
    );

    await screen.findByTestId("consultant-esri-map");
    expect(screen.queryByTestId("consultant-map-project-assignment-1")).toBeNull();
    expect(screen.getByText("No consultant projects match the current filters.")).toBeTruthy();
  });
});
