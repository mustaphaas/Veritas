import { describe, expect, it } from "vitest";
import {
  defaultFilters,
  matchingProjects,
  projects,
  stateProjectTargets,
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
    const states = summarizeProjectsByState(filtered);
    const mapTotal = states.reduce((total, state) => total + state.projects, 0);

    expect(states).toHaveLength(37);
    expect(states.every((state) => state.projects >= 5)).toBe(true);
    expect(states.every((state) => state.projects <= 20)).toBe(true);
    expect(mapTotal).toBe(projects.length);
    expect(summarizePortfolio(filtered).projects).toBe(projects.length);
    expect(projects.length).toBe(
      Object.values(stateProjectTargets).reduce(
        (total, count) => total + count,
        0,
      ),
    );
  });

  it("recalculates state counts after selecting NEP", () => {
    const filtered = withFilters({ programs: "NEP" });

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(projects.length);
    expect(filtered.every((project) => project.programme === "NEP")).toBe(true);
    expect(stateSummary(filtered, "Kano")?.projects).toBeGreaterThan(0);
  });

  it("combines NEP and Mini Grid filters with AND semantics", () => {
    const filtered = withFilters({ programs: "NEP", components: "Mini Grid" });

    expect(filtered.length).toBeGreaterThan(0);
    expect(
      filtered.every(
        (project) =>
          project.programme === "NEP" && project.component === "Mini Grid",
      ),
    ).toBe(true);
  });

  it("applies the selected reporting month to the same map dataset", () => {
    const filtered = withFilters({ programs: "NEP", months: "June 2024" });

    expect(filtered.length).toBeGreaterThan(0);
    expect(
      filtered.every(
        (project) =>
          project.programme === "NEP" && project.month === "June 2024",
      ),
    ).toBe(true);
  });

  it("focuses the data on Kano while preserving the active programme and component filters", () => {
    const filtered = withFilters({
      programs: "NEP",
      components: "Mini Grid",
      states: "Kano",
    });

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((project) => project.state === "Kano")).toBe(true);
  });

  it("keeps only SunVolt projects when the contractor filter is added", () => {
    const filtered = withFilters({
      programs: "NEP",
      components: "Mini Grid",
      states: "Kano",
      contractors: "SunVolt Nigeria",
    });

    expect(filtered.length).toBeGreaterThan(0);
    expect(
      filtered.every((project) => project.contractor === "SunVolt Nigeria"),
    ).toBe(true);
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
      projects: filtered.length,
      kw: filtered.reduce((total, project) => total + project.kw, 0),
      households: filtered.reduce(
        (total, project) => total + project.households,
        0,
      ),
      verified: filtered.filter((project) => project.verified).length,
      pending: filtered.filter((project) => !project.verified).length,
    });
    expect(kano?.byComponent).toEqual([
      { name: "Mini Grid", value: filtered.length },
    ]);
  });
});
