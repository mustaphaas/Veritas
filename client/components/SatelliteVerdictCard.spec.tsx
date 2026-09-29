import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SatelliteChoiceList,
  SatelliteVerdictCard,
  type SatelliteCardData,
} from "./SatelliteVerdictCard";

const base: SatelliteCardData = {
  project: { id: "p1", name: "Kura Mini-Grid", programme: "DARES", component: "Mini Grid", state: "Kano", lga: "Kura", community: "Kura Town" },
  resolvedVia: "name",
  verdict: { status: "present", imageQuality: "clear", confidence: 0.82, estimatedNearbyHouses: 17, notes: "Array-like structures visible." },
  imageUrl: "https://example.test/x.png",
  checkedAt: "2026-09-28T12:00:00.000Z",
  imagerySource: "Esri World Imagery",
  imageryDate: null,
  radiusMetres: 150,
  analysisMethod: "gemini-vision:test",
};

afterEach(cleanup);

describe("SatelliteVerdictCard", () => {
  it("shows verdict, confidence, rooftops, provenance and the evidence limit", () => {
    render(<SatelliteVerdictCard data={base} />);
    expect(screen.getByText("Infrastructure detected")).toBeTruthy();
    expect(screen.getByText(/82% confidence, about 17 rooftops in frame/)).toBeTruthy();
    expect(screen.getByText(/150 m radius/)).toBeTruthy();
    expect(screen.getByText(/imagery date not supplied/)).toBeTruthy();
    expect(screen.getByText(/does not establish installed capacity/)).toBeTruthy();
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });

  it("says unusable imagery is inconclusive, not evidence of absence", () => {
    render(
      <SatelliteVerdictCard
        data={{ ...base, verdict: { ...base.verdict, status: "inconclusive", imageQuality: "unusable", confidence: null, estimatedNearbyHouses: null } }}
      />,
    );
    expect(screen.getByText("Inconclusive")).toBeTruthy();
    expect(screen.getByText(/not evidence that the infrastructure is missing/)).toBeTruthy();
  });

  it("does not print confidence or rooftop figures the model never gave", () => {
    render(
      <SatelliteVerdictCard
        data={{ ...base, verdict: { ...base.verdict, confidence: null, estimatedNearbyHouses: null } }}
      />,
    );
    expect(screen.queryByText(/confidence/)).toBeNull();
    expect(screen.queryByText(/rooftops/)).toBeNull();
  });
});

describe("SatelliteChoiceList", () => {
  it("reports which project was chosen and can be disabled", () => {
    const onChoose = vi.fn();
    const choices = [
      { id: "a", name: "Dutse Phase 1", state: "Jigawa", lga: "Dutse", community: "Dutse Central", component: "Solar Street Light" },
      { id: "b", name: "Dutse Phase 2", state: "Jigawa", lga: "Dutse", community: "Limawa", component: "Solar Street Light" },
    ];
    const { rerender } = render(<SatelliteChoiceList choices={choices} onChoose={onChoose} />);
    fireEvent.click(screen.getByText("Dutse Phase 2"));
    expect(onChoose).toHaveBeenCalledWith(choices[1]);

    onChoose.mockClear();
    rerender(<SatelliteChoiceList choices={choices} disabled onChoose={onChoose} />);
    fireEvent.click(screen.getByText("Dutse Phase 1"));
    expect(onChoose).not.toHaveBeenCalled();
  });
});
