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
`  circleMarker: (latlng: [number, number], options?: Record<string, unknown>) => LeafletMarker;
  latLngBounds: (latlngs: Array<[number, number]>) => unknown;
};`,
`  circleMarker: (latlng: [number, number], options?: Record<string, unknown>) => LeafletMarker;
  polygon: (latlngs: unknown, options?: Record<string, unknown>) => { addTo: (map: LeafletMap) => unknown };
  latLngBounds: (latlngs: Array<[number, number]>) => unknown;
};`,
"Leaflet polygon typing",
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

        const points: Array<[number, number]> = [];`,
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

        const points: Array<[number, number]> = [];`,
"Nigeria outside-boundary dim mask",
);

fs.writeFileSync(file, source);
console.log("Applied Nigeria satellite mask.");
