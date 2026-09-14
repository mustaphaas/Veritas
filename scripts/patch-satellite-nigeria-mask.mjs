import fs from "node:fs";

const file = "client/components/ProjectMapSatelliteEnhancer.tsx";
let source = fs.readFileSync(file, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) {
    if (source.includes(to)) return;
    throw new Error(`Unable to apply ${label}: anchor not found`);
  }
  source = source.replace(from, to);
}

replaceOnce(
`type LeafletMap = {
  remove: () => void;
  invalidateSize: () => void;
  fitBounds: (bounds: unknown, options?: Record<string, unknown>) => void;
};`,
`type LeafletMap = {
  remove: () => void;
  invalidateSize: () => void;
  fitBounds: (bounds: unknown, options?: Record<string, unknown>) => void;
  setMaxBounds: (bounds: unknown) => void;
};`,
"Leaflet map bounds typing",
);

replaceOnce(
`type LeafletMarker = {
  bindPopup: (html: string) => LeafletMarker;
  addTo: (map: LeafletMap) => LeafletMarker;
};`,
`type LeafletLayerGroup = {
  addTo: (map: LeafletMap) => LeafletLayerGroup;
  clearLayers: () => void;
};

type LeafletMarker = {
  bindPopup: (html: string) => LeafletMarker;
  addTo: (target: LeafletMap | LeafletLayerGroup) => LeafletMarker;
};`,
"Leaflet layer group typing",
);

replaceOnce(
`  circleMarker: (latlng: [number, number], options?: Record<string, unknown>) => LeafletMarker;
  latLngBounds: (latlngs: Array<[number, number]>) => unknown;
};`,
`  circleMarker: (latlng: [number, number], options?: Record<string, unknown>) => LeafletMarker;
  polygon: (latlngs: unknown, options?: Record<string, unknown>) => { addTo: (map: LeafletMap) => unknown };
  layerGroup: () => LeafletLayerGroup;
  latLngBounds: (latlngs: Array<[number, number]>) => unknown;
};`,
"Leaflet polygon and layer group typing",
);

replaceOnce(
`function SatelliteCanvas({ projects, sharedState }: { projects: ReaMapProjectRecord[]; sharedState: SharedMapState }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [loadError, setLoadError] = useState(false);`,
`function renderSatelliteMarkers(
  L: LeafletApi,
  layer: LeafletLayerGroup,
  projects: ReaMapProjectRecord[],
  sharedState: SharedMapState,
) {
  layer.clearLayers();
  const points: Array<[number, number]> = [];
  if (!sharedState.layers.Projects) return points;

  projects.forEach((project) => {
    const latitude = Number(project.latitude);
    const longitude = Number(project.longitude);
    points.push([latitude, longitude]);
    const details = [
      \`<strong>\${escapeHtml(project.name)}</strong>\`,
      \`<span style="font-size:11px;color:#64748b">\${escapeHtml(project.community || project.lga || project.state)}</span>\`,
      \`<span style="font-size:11px;color:#08733f;font-weight:700">\${escapeHtml(project.programme)} · \${escapeHtml(project.status)}</span>\`,
      \`<span style="font-size:11px;color:#475569">\${Number(project.installedCapacityKw || 0).toLocaleString()} kW · \${Number(project.households || 0).toLocaleString()} households</span>\`,
    ];
    if (sharedState.layers.Contractors) details.push(\`<span style="font-size:11px;color:#475569">Contractor: \${escapeHtml(project.contractor)}</span>\`);
    if (sharedState.layers.Inspections) details.push(\`<span style="font-size:11px;color:#475569">Verification: \${project.verified === true || Number(project.verified) === 1 ? "Verified" : "Pending"}</span>\`);

    L.circleMarker([latitude, longitude], {
      radius: 6,
      color: "#ffffff",
      weight: 2,
      fillColor: markerColor(project, sharedState.layers.Status),
      fillOpacity: 0.96,
    })
      .bindPopup(\`<div style="min-width:210px;font-family:system-ui,sans-serif;display:grid;gap:4px">\${details.join("")}</div>\`)
      .addTo(layer);
  });

  return points;
}

function SatelliteCanvas({ projects, sharedState }: { projects: ReaMapProjectRecord[]; sharedState: SharedMapState }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LeafletLayerGroup | null>(null);
  const [loadError, setLoadError] = useState(false);`,
"stable satellite marker layer",
);

replaceOnce(
`  const filteredProjects = useMemo(() => filterProjects(projects, sharedState), [projects, sharedState]);
  const mappable = useMemo(() => filteredProjects.filter(validCoordinate), [filteredProjects]);
  const verifiedCount = filteredProjects.filter((project) => project.verified === true || Number(project.verified) === 1).length;
  const capacityKw = filteredProjects.reduce((sum, project) => sum + Number(project.installedCapacityKw || 0), 0);
  const households = filteredProjects.reduce((sum, project) => sum + Number(project.households || 0), 0);`,
`  const filteredProjects = useMemo(() => filterProjects(projects, sharedState), [projects, sharedState]);
  const mappable = useMemo(() => filteredProjects.filter(validCoordinate), [filteredProjects]);`,
"remove satellite summary calculations",
);

replaceOnce(
`        const map = L.map(elementRef.current, {
          zoomControl: true,
          minZoom: 5,
          maxZoom: 19,
          attributionControl: true,
        }).setView(projectMapSatelliteInitialView.center, projectMapSatelliteInitialView.zoom);`,
`        const nigeriaMaxBounds = [[3.2, 2.0], [14.9, 15.2]];
        const map = L.map(elementRef.current, {
          zoomControl: true,
          minZoom: 5,
          maxZoom: 19,
          attributionControl: true,
          maxBounds: nigeriaMaxBounds,
          maxBoundsViscosity: 0.92,
        }).setView(projectMapSatelliteInitialView.center, projectMapSatelliteInitialView.zoom);
        map.setMaxBounds(nigeriaMaxBounds);`,
"Nigeria pan bounds",
);

replaceOnce(
`        L.tileLayer(SATELLITE_TILE_URL, {
          maxZoom: 19,
          attribution: "Tiles © Esri",
        }).addTo(map);

        const points: Array<[number, number]> = [];
        if (sharedState.layers.Projects) {
          mappable.forEach((project) => {
            const latitude = Number(project.latitude);
            const longitude = Number(project.longitude);
            points.push([latitude, longitude]);
            const details = [
              \`<strong>\${escapeHtml(project.name)}</strong>\`,
              \`<span style="font-size:11px;color:#64748b">\${escapeHtml(project.community || project.lga || project.state)}</span>\`,
              \`<span style="font-size:11px;color:#08733f;font-weight:700">\${escapeHtml(project.programme)} · \${escapeHtml(project.status)}</span>\`,
              \`<span style="font-size:11px;color:#475569">\${Number(project.installedCapacityKw || 0).toLocaleString()} kW · \${Number(project.households || 0).toLocaleString()} households</span>\`,
            ];
            if (sharedState.layers.Contractors) details.push(\`<span style="font-size:11px;color:#475569">Contractor: \${escapeHtml(project.contractor)}</span>\`);
            if (sharedState.layers.Inspections) details.push(\`<span style="font-size:11px;color:#475569">Verification: \${project.verified === true || Number(project.verified) === 1 ? "Verified" : "Pending"}</span>\`);

            L.circleMarker([latitude, longitude], {
              radius: 6,
              color: "#ffffff",
              weight: 2,
              fillColor: markerColor(project, sharedState.layers.Status),
              fillOpacity: 0.96,
            })
              .bindPopup(\`<div style="min-width:210px;font-family:system-ui,sans-serif;display:grid;gap:4px">\${details.join("")}</div>\`)
              .addTo(map);
          });
        }

        if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 12 });`,
`        L.tileLayer(SATELLITE_TILE_URL, {
          maxZoom: 19,
          attribution: "Tiles © Esri",
        }).addTo(map);

        const markerLayer = L.layerGroup().addTo(map);
        markerLayerRef.current = markerLayer;
        const points = renderSatelliteMarkers(L, markerLayer, mappable, sharedState);
        if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 12 });`,
"stable satellite marker rendering",
);

replaceOnce(
`        L.tileLayer(SATELLITE_TILE_URL, {
          maxZoom: 19,
          attribution: "Tiles © Esri",
        }).addTo(map);

        const markerLayer = L.layerGroup().addTo(map);`,
`        L.tileLayer(SATELLITE_TILE_URL, {
          maxZoom: 19,
          attribution: "Tiles © Esri",
        }).addTo(map);

        fetch("/nigeria-adm1.geojson")
          .then((response) => {
            if (!response.ok) throw new Error("Nigeria boundary request failed");
            return response.json();
          })
          .then((data) => {
            if (cancelled) return;
            const features = Array.isArray(data?.features) ? data.features : [];
            const nigeriaRings = features.flatMap((feature) => {
              const geometry = feature?.geometry;
              if (!geometry || !Array.isArray(geometry.coordinates)) return [];
              const polygonRings = geometry.type === "Polygon"
                ? [geometry.coordinates[0]]
                : geometry.type === "MultiPolygon"
                  ? geometry.coordinates.map((polygon) => polygon[0])
                  : [];
              return polygonRings
                .filter(Array.isArray)
                .map((ring) => ring.map(([longitude, latitude]) => [latitude, longitude]));
            });
            if (!nigeriaRings.length) return;
            const worldRing = [[-85, -180], [-85, 180], [85, 180], [85, -180], [-85, -180]];
            L.polygon([worldRing, ...nigeriaRings], {
              stroke: false,
              fillColor: "#06130d",
              fillOpacity: 0.58,
              fillRule: "evenodd",
              interactive: false,
            }).addTo(map);
          })
          .catch(() => undefined);

        const markerLayer = L.layerGroup().addTo(map);`,
"Nigeria outside-boundary dim mask",
);

replaceOnce(
`    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mappable, sharedState.layers.Contractors, sharedState.layers.Inspections, sharedState.layers.Projects, sharedState.layers.Status]);`,
`    return () => {
      cancelled = true;
      markerLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = window.L;
    const layer = markerLayerRef.current;
    if (!L || !layer) return;
    renderSatelliteMarkers(L, layer, mappable, sharedState);
  }, [mappable, sharedState]);`,
"layer toggle overlay refresh",
);

replaceOnce(
`      <div className="pointer-events-none absolute left-4 top-16 z-[500] flex flex-wrap gap-2">
        <span className="rounded-md border border-white/20 bg-[#173b2a]/90 px-2.5 py-1.5 text-[9px] font-extrabold text-white shadow-sm backdrop-blur">{filteredProjects.length.toLocaleString()} Projects</span>
        <span className="rounded-md border border-white/20 bg-[#173b2a]/90 px-2.5 py-1.5 text-[9px] font-extrabold text-white shadow-sm backdrop-blur">{verifiedCount.toLocaleString()} Verified</span>
        <span className="rounded-md border border-white/20 bg-[#173b2a]/90 px-2.5 py-1.5 text-[9px] font-extrabold text-white shadow-sm backdrop-blur">{(capacityKw / 1000).toFixed(1)} MW</span>
        <span className="rounded-md border border-white/20 bg-[#173b2a]/90 px-2.5 py-1.5 text-[9px] font-extrabold text-white shadow-sm backdrop-blur">{households.toLocaleString()} Households</span>
      </div>
`,
``,
"remove satellite portfolio badges",
);

fs.writeFileSync(file, source);
console.log("Applied Nigeria satellite mask and stable layer overlays.");
