import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ConsultantEsriCoverageMap, { nigeriaConstraintGeometry, nigeriaMaskGeometry } from "./ConsultantEsriCoverageMap";

class ArcgisMapStub extends HTMLElement {
  graphics = {
    removeAll: vi.fn(),
    addMany: vi.fn(),
  };
  map: any = null;
  popupEnabled = false;
  componentOnReady = vi.fn(async () => undefined);
  viewOnReady = vi.fn(async () => undefined);
  hitTest = vi.fn(async () => ({ results: [] }));
  goTo = vi.fn(async () => undefined);
  destroy = vi.fn(async () => undefined);
}

class ArcgisZoomStub extends HTMLElement {}

class FakeMap {
  basemap: any;
  constructor(options: any) {
    this.basemap = options.basemap;
  }
}

class FakeBasemap {
  id: string;
  title: string;
  constructor(options: any) {
    Object.assign(this, options);
  }
}

class FakeTileLayer {
  url: string;
  title: string;
  constructor(options: any) {
    Object.assign(this, options);
  }
}

class FakeGraphic {
  geometry: any;
  attributes: any;
  symbol: any;
  constructor(options: any) {
    Object.assign(this, options);
  }
}

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

beforeAll(() => {
  if (!customElements.get("arcgis-map")) customElements.define("arcgis-map", ArcgisMapStub);
  if (!customElements.get("arcgis-zoom")) customElements.define("arcgis-zoom", ArcgisZoomStub);
});

describe("ConsultantEsriCoverageMap", () => {
  it("builds Nigeria-only navigation and outside-country mask geometry", () => {
    const constraint = nigeriaConstraintGeometry([stateFeature]);
    const mask = nigeriaMaskGeometry([stateFeature]);
    expect(constraint.type).toBe("polygon");
    expect(constraint.rings.length).toBe(1);
    expect(mask.rings.length).toBe(2);
    expect(mask.rings[0][0]).toEqual([-180, -80]);
  });

  beforeEach(() => {
    vi.stubGlobal("$arcgis", undefined);
    Object.defineProperty(window, "$arcgis", {
      configurable: true,
      value: {
        import: vi.fn(async () => [FakeMap, FakeBasemap, FakeTileLayer, FakeGraphic]),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses Esri map and supports map and satellite basemaps", async () => {
    render(
      <ConsultantEsriCoverageMap
        stateFeatures={[stateFeature]}
        stateCounts={new Map([["Kaduna", 1]])}
        lgaFeatures={[]}
        lgaCounts={new Map()}
        projects={[
          {
            id: "p1",
            state: "Kaduna",
            lga: "Igabi",
            latitude: 10.5,
            longitude: 7.5,
            color: "#08733f",
          },
        ]}
        selectedState={null}
        selectedLga={null}
        onSelectState={vi.fn()}
        onSelectLga={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("consultant-esri-map-shell")).toBeTruthy();
    const map = await screen.findByTestId("consultant-esri-map");
    await waitFor(() => {
      expect((map as ArcgisMapStub).map).toBeTruthy();
      expect((map as ArcgisMapStub).graphics.addMany).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("consultant-esri-basemap-satellite"));
    await waitFor(() => {
      expect((map as ArcgisMapStub).map.basemap.id).toBe("veritas-esri-satellite");
    });

    fireEvent.click(screen.getByTestId("consultant-esri-basemap-map"));
    await waitFor(() => {
      expect((map as ArcgisMapStub).map.basemap.id).toBe("veritas-esri-map");
    });
  });

  it("turns Esri hit-test results into state, LGA and project selection", async () => {
    const onSelectState = vi.fn();
    const onSelectLga = vi.fn();
    const onSelectProject = vi.fn();

    const { rerender } = render(
      <ConsultantEsriCoverageMap
        stateFeatures={[stateFeature]}
        stateCounts={new Map([["Kaduna", 1]])}
        lgaFeatures={[]}
        lgaCounts={new Map()}
        projects={[
          {
            id: "p1",
            state: "Kaduna",
            lga: "Igabi",
            latitude: 10.5,
            longitude: 7.5,
            color: "#08733f",
          },
        ]}
        selectedState={null}
        selectedLga={null}
        onSelectState={onSelectState}
        onSelectLga={onSelectLga}
        onSelectProject={onSelectProject}
      />,
    );

    const map = (await screen.findByTestId("consultant-esri-map")) as ArcgisMapStub;
    await waitFor(() => expect(map.map).toBeTruthy());

    map.hitTest.mockResolvedValueOnce({
      results: [{ type: "graphic", graphic: { attributes: { kind: "state", state: "Kaduna", count: 1 } } }],
    });
    map.dispatchEvent(new CustomEvent("arcgisViewClick", { detail: { x: 100, y: 100 } }));
    await waitFor(() => expect(onSelectState).toHaveBeenCalledWith("Kaduna"));

    rerender(
      <ConsultantEsriCoverageMap
        stateFeatures={[stateFeature]}
        stateCounts={new Map([["Kaduna", 1]])}
        lgaFeatures={[lgaFeature]}
        lgaCounts={new Map([["Igabi", 1]])}
        projects={[
          {
            id: "p1",
            state: "Kaduna",
            lga: "Igabi",
            latitude: 10.5,
            longitude: 7.5,
            color: "#08733f",
          },
        ]}
        selectedState="Kaduna"
        selectedLga={null}
        onSelectState={onSelectState}
        onSelectLga={onSelectLga}
        onSelectProject={onSelectProject}
      />,
    );

    map.hitTest.mockResolvedValueOnce({
      results: [{ type: "graphic", graphic: { attributes: { kind: "lga", lga: "Igabi", count: 1 } } }],
    });
    map.dispatchEvent(new CustomEvent("arcgisViewClick", { detail: { x: 120, y: 120 } }));
    await waitFor(() => expect(onSelectLga).toHaveBeenCalledWith("Igabi"));

    map.hitTest.mockResolvedValueOnce({
      results: [{ type: "graphic", graphic: { attributes: { kind: "project", projectId: "p1" } } }],
    });
    map.dispatchEvent(new CustomEvent("arcgisViewClick", { detail: { x: 130, y: 130 } }));
    await waitFor(() => expect(onSelectProject).toHaveBeenCalledWith("p1"));
  });
});
