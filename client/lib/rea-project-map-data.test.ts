import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReaMapProjects, resolveProjectCoordinate } from "./rea-project-map-data";

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
});
