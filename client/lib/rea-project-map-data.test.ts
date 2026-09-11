import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReaMapProjects, reaRecordToDashboardProject, resolveProjectCoordinate } from "./rea-project-map-data";

afterEach(() => vi.unstubAllGlobals());

describe("REA project map D1 adapter", () => {
  it("returns stored longitude and latitude without fabrication", () => {
    expect(resolveProjectCoordinate({ latitude: 9.0232043, longitude: 7.4518017 })).toEqual([7.4518017, 9.0232043]);
    expect(resolveProjectCoordinate({ latitude: null, longitude: null })).toBeNull();
    expect(resolveProjectCoordinate({ latitude: 91, longitude: 7.4 })).toBeNull();
  });

  it("loads project coordinates with the authenticated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ projects: [{ id: "FCT-MG-DURUMI-001", latitude: 9.0232043, longitude: 7.4518017 }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const projects = await fetchReaMapProjects("session-token");
    expect(fetchMock).toHaveBeenCalledWith("/api/rea/projects", { headers: { Authorization: "Bearer session-token" } });
    expect(projects[0]).toMatchObject({ latitude: 9.0232043, longitude: 7.4518017 });
  });

  it("converts the same D1 record into the Overview dashboard project shape", () => {
    const project = reaRecordToDashboardProject({
      id: "DEMO-KANO-001",
      name: "Kano Mini Grid Project 01",
      programme: "NEP",
      component: "Mini Grid",
      contractor: "SunVolt Nigeria",
      consultantFirm: "Supreme Way Nigeria Limited",
      state: "Kano",
      lga: "Kano Central",
      community: "Kano Community 1",
      reportingMonth: "June 2024",
      status: "Verified",
      installedCapacityKw: 650,
      households: 920,
      verified: true,
      latitude: 12.0022,
      longitude: 8.592,
      geofenceRadiusMetres: 250,
      dataSource: "demo-dashboard",
      updatedAt: "2026-09-11T00:00:00.000Z",
    });

    expect(project).toMatchObject({
      name: "Kano Mini Grid Project 01",
      state: "Kano",
      programme: "NEP",
      component: "Mini Grid",
      contractor: "SunVolt Nigeria",
      month: "June 2024",
      status: "Verified",
      kw: 650,
      households: 920,
      verified: true,
      latitude: 12.0022,
      longitude: 8.592,
    });
  });
});
