import { useEffect, useMemo, useRef, useState } from "react";

type GeoFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

export type ConsultantEsriProject = {
  id: string;
  state: string;
  lga: string | null;
  latitude: number | null;
  longitude: number | null;
  color: string;
};

type ArcgisMapElement = HTMLElement & {
  map?: any;
  graphics?: { removeAll: () => void; addMany: (graphics: any[]) => void };
  popupEnabled?: boolean;
  constraints?: unknown;
  componentOnReady?: () => Promise<unknown>;
  viewOnReady?: () => Promise<unknown>;
  hitTest?: (target: unknown) => Promise<{ results?: any[] }>;
  goTo?: (target: unknown, options?: unknown) => Promise<unknown>;
  destroy?: () => Promise<unknown>;
};

type ArcgisRuntime = {
  Map: any;
  Basemap: any;
  TileLayer: any;
  Graphic: any;
};

declare global {
  interface Window {
    $arcgis?: {
      import: (modules: string | string[]) => Promise<any>;
    };
  }

  namespace JSX {
    interface IntrinsicElements {
      "arcgis-map": any;
      "arcgis-zoom": any;
    }
  }
}

const LIGHT_GRAY_BASE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer";
const LIGHT_GRAY_REFERENCE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer";
const WORLD_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const WORLD_REFERENCE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer";

function normaliseStateName(value: unknown) {
  const state = String(value ?? "").replace(/ State$/i, "").trim();
  if (/Federal Capital Territory/i.test(state) || /^Abuja$/i.test(state)) return "FCT";
  return state;
}

function stateName(feature: GeoFeature) {
  return normaliseStateName(
    feature.properties.NAME_1 ??
      feature.properties.shapeName ??
      feature.properties.name ??
      feature.properties.STATE,
  );
}

function lgaName(feature: GeoFeature) {
  return String(
    feature.properties.VARNAME_2 ??
      feature.properties.NAME_2 ??
      feature.properties.shapeName ??
      feature.properties.name ??
      "LGA",
  ).trim();
}

function densityFill(count: number, maximum: number) {
  if (!count) return "#eef3ef";
  const ratio = maximum ? count / maximum : 0;
  if (ratio > 0.75) return "#16824b";
  if (ratio > 0.5) return "#5fa774";
  if (ratio > 0.25) return "#9dcaab";
  return "#d8ebdd";
}

function geometryJson(feature: GeoFeature) {
  return {
    type: "polygon",
    rings:
      feature.geometry.type === "Polygon"
        ? feature.geometry.coordinates
        : (feature.geometry.coordinates as number[][][][]).flat(),
    spatialReference: { wkid: 4326 },
  };
}

function ringArea(ring: number[][]) {
  let area = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    area +=
      Number(ring[previous]?.[0] ?? 0) * Number(ring[index]?.[1] ?? 0) -
      Number(ring[index]?.[0] ?? 0) * Number(ring[previous]?.[1] ?? 0);
  }
  return area / 2;
}

function closeRing(ring: number[][]) {
  if (!ring.length) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first?.[0] === last?.[0] && first?.[1] === last?.[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

function orientRing(ring: number[][], clockwise: boolean) {
  const closed = closeRing(ring);
  const isClockwise = ringArea(closed) < 0;
  return isClockwise === clockwise ? closed : [...closed].reverse();
}

function featureOuterRings(feature: GeoFeature) {
  if (feature.geometry.type === "Polygon") {
    const polygons = feature.geometry.coordinates as number[][][];
    return polygons[0] ? [polygons[0]] : [];
  }
  return (feature.geometry.coordinates as number[][][][])
    .map((polygon) => polygon[0])
    .filter((ring): ring is number[][] => Boolean(ring));
}

export function nigeriaConstraintGeometry(stateFeatures: GeoFeature[]) {
  return {
    type: "polygon",
    rings: stateFeatures.flatMap((feature) =>
      featureOuterRings(feature).map((ring) => orientRing(ring, true)),
    ),
    spatialReference: { wkid: 4326 },
  };
}

export function nigeriaMaskGeometry(stateFeatures: GeoFeature[]) {
  const worldRing = orientRing(
    [
      [-180, -80],
      [-180, 80],
      [180, 80],
      [180, -80],
      [-180, -80],
    ],
    true,
  );
  const nigeriaHoles = stateFeatures.flatMap((feature) =>
    featureOuterRings(feature).map((ring) => orientRing(ring, false)),
  );
  return {
    type: "polygon",
    rings: [worldRing, ...nigeriaHoles],
    spatialReference: { wkid: 4326 },
  };
}

function buildBasemap(runtime: ArcgisRuntime, mode: "map" | "satellite") {
  if (mode === "satellite") {
    return new runtime.Basemap({
      title: "Esri Satellite",
      id: "veritas-esri-satellite",
      baseLayers: [
        new runtime.TileLayer({
          url: WORLD_IMAGERY,
          title: "Esri World Imagery",
        }),
      ],
      referenceLayers: [
        new runtime.TileLayer({
          url: WORLD_REFERENCE,
          title: "World Boundaries and Places",
        }),
      ],
    });
  }

  return new runtime.Basemap({
    title: "Esri Map",
    id: "veritas-esri-map",
    baseLayers: [
      new runtime.TileLayer({
        url: LIGHT_GRAY_BASE,
        title: "Esri Light Gray Canvas",
      }),
    ],
    referenceLayers: [
      new runtime.TileLayer({
        url: LIGHT_GRAY_REFERENCE,
        title: "Esri Light Gray Reference",
      }),
    ],
  });
}

async function loadRuntime(): Promise<ArcgisRuntime | null> {
  if (!window.$arcgis) return null;
  const modules = await window.$arcgis.import([
    "@arcgis/core/Map.js",
    "@arcgis/core/Basemap.js",
    "@arcgis/core/layers/TileLayer.js",
    "@arcgis/core/Graphic.js",
  ]);
  const [Map, Basemap, TileLayer, Graphic] = modules;
  return { Map, Basemap, TileLayer, Graphic };
}

export default function ConsultantEsriCoverageMap({
  stateFeatures,
  stateCounts,
  lgaFeatures,
  lgaCounts,
  projects,
  selectedState,
  selectedLga,
  selectedProjectId,
  onSelectState,
  onSelectLga,
  onSelectProject,
}: {
  stateFeatures: GeoFeature[];
  stateCounts: Map<string, number>;
  lgaFeatures: GeoFeature[];
  lgaCounts: Map<string, number>;
  projects: ConsultantEsriProject[];
  selectedState: string | null;
  selectedLga: string | null;
  selectedProjectId?: string;
  onSelectState: (state: string) => void;
  onSelectLga: (lga: string) => void;
  onSelectProject: (projectId: string) => void;
}) {
  const mapRef = useRef<ArcgisMapElement | null>(null);
  const runtimeRef = useRef<ArcgisRuntime | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const projectRef = useRef(projects);
  const [basemapMode, setBasemapMode] = useState<"map" | "satellite">("map");
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  projectRef.current = projects;

  const maximumStateCount = Math.max(0, ...stateCounts.values());
  const maximumLgaCount = Math.max(0, ...lgaCounts.values());
  const selectedStateFeature = useMemo(
    () => stateFeatures.find((feature) => stateName(feature) === selectedState) ?? null,
    [selectedState, stateFeatures],
  );
  const selectedLgaFeature = useMemo(
    () => lgaFeatures.find((feature) => lgaName(feature) === selectedLga) ?? null,
    [lgaFeatures, selectedLga],
  );

  useEffect(() => {
    const mapElement = mapRef.current;
    if (!mapElement) return;

    let cancelled = false;
    let retry: number | undefined;

    const initialise = async () => {
      try {
        const runtime = await loadRuntime();
        if (!runtime) {
          retry = window.setTimeout(initialise, 250);
          return;
        }
        if (cancelled) return;
        await mapElement.componentOnReady?.();
        if (cancelled) return;

        runtimeRef.current = runtime;
        const map = new runtime.Map({
          basemap: buildBasemap(runtime, basemapMode),
        });
        mapInstanceRef.current = map;
        mapElement.map = map;
        mapElement.popupEnabled = false;
        await mapElement.viewOnReady?.();
        if (cancelled) return;
        mapElement.constraints = {
          geometry: nigeriaConstraintGeometry(stateFeatures),
          minScale: 12_000_000,
          maxScale: 0,
          rotationEnabled: false,
          snapToZoom: false,
        };
        setMapReady(true);
      } catch {
        if (!cancelled) setMapError(true);
      }
    };

    void initialise();

    return () => {
      cancelled = true;
      if (retry) window.clearTimeout(retry);
      void mapElement.destroy?.();
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !runtimeRef.current || !mapInstanceRef.current) return;
    mapInstanceRef.current.basemap = buildBasemap(runtimeRef.current, basemapMode);
  }, [basemapMode, mapReady]);

  useEffect(() => {
    const mapElement = mapRef.current;
    if (!mapElement) return;

    const handleMapClick = async (event: Event) => {
      if (typeof mapElement.hitTest !== "function") return;
      const detail = (event as CustomEvent).detail;
      const response = await mapElement.hitTest(detail);
      const graphicHit = response.results?.find(
        (result) => result?.type === "graphic" && result.graphic?.attributes?.kind,
      );
      const attributes = graphicHit?.graphic?.attributes;
      if (!attributes) return;

      if (attributes.kind === "state" && attributes.count > 0) {
        onSelectState(String(attributes.state));
        return;
      }
      if (attributes.kind === "lga" && attributes.count > 0) {
        onSelectLga(String(attributes.lga));
        return;
      }
      if (attributes.kind === "project") {
        const projectId = String(attributes.projectId);
        if (projectRef.current.some((project) => project.id === projectId)) {
          onSelectProject(projectId);
        }
      }
    };

    mapElement.addEventListener("arcgisViewClick", handleMapClick);
    return () => mapElement.removeEventListener("arcgisViewClick", handleMapClick);
  }, [onSelectLga, onSelectProject, onSelectState]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const mapElement = mapRef.current;
    if (!mapReady || !runtime || !mapElement?.graphics) return;

    const graphics: any[] = [
      new runtime.Graphic({
        geometry: nigeriaMaskGeometry(stateFeatures),
        attributes: { kind: "nigeria-mask" },
        symbol: {
          type: "simple-fill",
          color:
            basemapMode === "satellite"
              ? [6, 19, 13, 0.72]
              : [246, 249, 247, 0.94],
          outline: { color: [0, 0, 0, 0], width: 0 },
        },
      }),
    ];

    if (!selectedState) {
      for (const feature of stateFeatures) {
        const name = stateName(feature);
        const count = stateCounts.get(name) ?? 0;
        graphics.push(
          new runtime.Graphic({
            geometry: geometryJson(feature),
            attributes: { kind: "state", state: name, count },
            symbol: {
              type: "simple-fill",
              color: densityFill(count, maximumStateCount),
              outline: { color: "#ffffff", width: 1.1 },
            },
          }),
        );
      }
    } else if (!selectedLga) {
      for (const feature of lgaFeatures) {
        const name = lgaName(feature);
        const count = lgaCounts.get(name) ?? 0;
        graphics.push(
          new runtime.Graphic({
            geometry: geometryJson(feature),
            attributes: { kind: "lga", lga: name, count },
            symbol: {
              type: "simple-fill",
              color: densityFill(count, maximumLgaCount),
              outline: { color: "#ffffff", width: 1 },
            },
          }),
        );
      }
    } else if (selectedLgaFeature) {
      graphics.push(
        new runtime.Graphic({
          geometry: geometryJson(selectedLgaFeature),
          attributes: { kind: "lga", lga: selectedLga, count: lgaCounts.get(selectedLga) ?? 0 },
          symbol: {
            type: "simple-fill",
            color: "#e5f3e9",
            outline: { color: "#5fa774", width: 1.5 },
          },
        }),
      );
    }

    for (const project of projects) {
      if (!Number.isFinite(project.latitude) || !Number.isFinite(project.longitude)) continue;
      const selected = project.id === selectedProjectId;
      graphics.push(
        new runtime.Graphic({
          geometry: {
            type: "point",
            latitude: project.latitude,
            longitude: project.longitude,
            spatialReference: { wkid: 4326 },
          },
          attributes: {
            kind: "project",
            projectId: project.id,
            state: project.state,
            lga: project.lga,
          },
          symbol: {
            type: "simple-marker",
            style: "circle",
            color: project.color,
            size: selected ? 13 : 9,
            outline: {
              color: "#ffffff",
              width: selected ? 2.5 : 1.5,
            },
          },
        }),
      );
    }

    mapElement.graphics.removeAll();
    mapElement.graphics.addMany(graphics);
  }, [
    basemapMode,
    lgaCounts,
    lgaFeatures,
    mapReady,
    maximumLgaCount,
    maximumStateCount,
    projects,
    selectedLga,
    selectedLgaFeature,
    selectedProjectId,
    selectedState,
    stateCounts,
    stateFeatures,
  ]);

  useEffect(() => {
    const mapElement = mapRef.current;
    if (!mapReady || typeof mapElement?.goTo !== "function") return;

    const selectedProject = projects.find((project) => project.id === selectedProjectId);
    if (
      selectedProject &&
      Number.isFinite(selectedProject.latitude) &&
      Number.isFinite(selectedProject.longitude)
    ) {
      void mapElement
        .goTo(
          {
            center: [selectedProject.longitude, selectedProject.latitude],
            zoom: 15,
          },
          { duration: 550 },
        )
        .catch(() => undefined);
      return;
    }

    if (selectedLgaFeature) {
      void mapElement
        .goTo({ target: geometryJson(selectedLgaFeature), padding: 55 }, { duration: 650 })
        .catch(() => undefined);
      return;
    }

    if (selectedStateFeature) {
      void mapElement
        .goTo({ target: geometryJson(selectedStateFeature), padding: 45 }, { duration: 650 })
        .catch(() => undefined);
      return;
    }

    void mapElement
      .goTo(
        {
          target: nigeriaConstraintGeometry(stateFeatures),
          padding: { top: 26, right: 26, bottom: 26, left: 26 },
        },
        { duration: 500 },
      )
      .catch(() => undefined);
  }, [
    mapReady,
    projects,
    selectedLgaFeature,
    selectedProjectId,
    selectedStateFeature,
    stateFeatures,
  ]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#eef4f0]" data-testid="consultant-esri-map-shell">
      <arcgis-map
        ref={mapRef}
        data-testid="consultant-esri-map"
        className="absolute inset-0 block h-full w-full"
        aria-label={
          selectedLga
            ? `${selectedLga} project locations on Esri map`
            : selectedState
              ? `${selectedState} consultant projects on Esri map`
              : "Nigeria consultant project coverage on Esri map"
        }
      >
        <arcgis-zoom slot="top-left" />
      </arcgis-map>

      <div className="absolute right-3 top-3 z-20 flex overflow-hidden rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          data-testid="consultant-esri-basemap-map"
          onClick={() => setBasemapMode("map")}
          className={`rounded-md px-3 py-1.5 text-[9px] font-bold transition ${
            basemapMode === "map"
              ? "bg-[#08733f] text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Map
        </button>
        <button
          type="button"
          data-testid="consultant-esri-basemap-satellite"
          onClick={() => setBasemapMode("satellite")}
          className={`rounded-md px-3 py-1.5 text-[9px] font-bold transition ${
            basemapMode === "satellite"
              ? "bg-[#08733f] text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Satellite
        </button>
      </div>

      {!mapReady && !mapError && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#f8fbf9]/90 text-xs font-semibold text-slate-500">
          Loading Esri project coverage…
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/95 p-6 text-center">
          <div>
            <p className="text-xs font-bold text-[#173b2a]">Esri map could not be loaded.</p>
            <p className="mt-1 text-[10px] text-slate-500">
              Project selection remains available from the portfolio list.
            </p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 left-3 z-20 rounded-md bg-white/90 px-2 py-1 text-[8px] font-semibold text-slate-500 shadow-sm backdrop-blur">
        Nigeria extent locked · Esri basemap · Veritas project and local LGA overlays
      </div>
    </div>
  );
}
