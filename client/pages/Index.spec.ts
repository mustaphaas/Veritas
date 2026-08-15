import { describe, expect, it } from "vitest";
import {
  defaultFilters,
  matchingProjects,
  summarizePortfolio,
  summarizeProjectsByState,
  type Filters,
} from "../lib/dashboard-data";

function withFilters(changes: Partial<Filters>) {
  return matchingProjects({ ...defaultFilters, ...changes });
}

function stateSummary(
  filteredProjects: ReturnType<typeof matchingProjects>,
  state: string,
) {
  return summarizeProjectsByState(filteredProjects).find(
    (summary) => summary.state === state,
  );
}

describe("REA dashboard filter-driven map data", () => {
  it("keeps the map state total equal to the Projects KPI for the all-project view", () => {
    const filtered = withFilters({});
    const mapTotal = summarizeProjectsByState(filtered).reduce(
      (total, state) => total + state.projects,
      0,
    );

    expect(filtered).toHaveLength(8);
    expect(mapTotal).toBe(8);
    expect(summarizePortfolio(filtered)).toMatchObject({
      projects: 8,
      kw: 18500,
      households: 24300,
      verified: 5,
      pending: 3,
      verificationRate: 63,
    });
  });

  it("recalculates state counts after selecting NEP", () => {
    const filtered = withFilters({ programs: "NEP" });

    expect(filtered).toHaveLength(3);
    expect(stateSummary(filtered, "Kano")?.projects).toBe(1);
    expect(stateSummary(filtered, "FCT")?.projects).toBe(1);
    expect(stateSummary(filtered, "Jigawa")?.projects).toBe(1);
  });

  it("combines NEP and Mini Grid filters with AND semantics", () => {
    const filtered = withFilters({ programs: "NEP", components: "Mini Grid" });

    expect(filtered).toHaveLength(2);
    expect(filtered.map((project) => project.state).sort()).toEqual([
      "Jigawa",
      "Kano",
    ]);
  });

  it("applies the selected reporting month to the same map dataset", () => {
    const filtered = withFilters({ programs: "NEP", months: "June 2024" });

    expect(filtered).toHaveLength(2);
    expect(filtered.map((project) => project.state).sort()).toEqual([
      "FCT",
      "Kano",
    ]);
  });

  it("focuses the data on Kano while preserving the active programme and component filters", () => {
    const filtered = withFilters({
      programs: "NEP",
      components: "Mini Grid",
      states: "Kano",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].state).toBe("Kano");
  });

  it("keeps only SunVolt projects when the contractor filter is added", () => {
    const filtered = withFilters({
      programs: "NEP",
      components: "Mini Grid",
      states: "Kano",
      contractors: "SunVolt Nigeria",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].contractor).toBe("SunVolt Nigeria");
  });

  it("builds the Kano details panel metrics from the same filtered record", () => {
    const filtered = withFilters({
      programs: "NEP",
      components: "Mini Grid",
      states: "Kano",
      contractors: "SunVolt Nigeria",
    });
    const kano = stateSummary(filtered, "Kano");

    expect(kano).toMatchObject({
      projects: 1,
      kw: 3200,
      households: 4200,
      verified: 1,
      pending: 0,
    });
    expect(kano?.byComponent).toEqual([{ name: "Mini Grid", value: 1 }]);
  });
});
