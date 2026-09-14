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
`type LeafletMarker = {
  bindPopup: (html: string) => LeafletMarker;
  addTo: (target: LeafletMap | LeafletLayerGroup) => LeafletMarker;
};`,
`type LeafletMarker = {
  bindPopup: (html: string) => LeafletMarker;
  addTo: (target: LeafletMap | LeafletLayerGroup) => LeafletMarker;
  on: (event: string, handler: () => void) => LeafletMarker;
};`,
"Leaflet marker click typing",
);

replaceOnce(
`function renderLeafletMarkers(L: LeafletApi, layer: LeafletLayerGroup, projects: ReaMapProjectRecord[], sharedState: SharedMapState) {`,
`function renderLeafletMarkers(L: LeafletApi, layer: LeafletLayerGroup, projects: ReaMapProjectRecord[], sharedState: SharedMapState, map: LeafletMap) {`,
"Leaflet marker renderer map argument",
);

replaceOnce(
`    })
      .bindPopup(projectPopupHtml(project, sharedState))
      .addTo(layer);`,
`    })
      .bindPopup(projectPopupHtml(project, sharedState))
      .on("click", () => map.setView([latitude, longitude], PROJECT_FOCUS_ZOOM))
      .addTo(layer);`,
"Esri marker click zoom",
);

replaceOnce(
`        renderLeafletMarkers(L, markerLayer, mappable, sharedState);`,
`        renderLeafletMarkers(L, markerLayer, mappable, sharedState, map);`,
"initial Esri marker render",
);

replaceOnce(
`    const L = leafletRef.current;
    const layer = markerLayerRef.current;
    if (!L || !layer) return;
    renderLeafletMarkers(L, layer, mappable, sharedState);`,
`    const L = leafletRef.current;
    const layer = markerLayerRef.current;
    const map = mapRef.current;
    if (!L || !layer || !map) return;
    renderLeafletMarkers(L, layer, mappable, sharedState, map);`,
"refreshed Esri marker render",
);

replaceOnce(
`    mappable.forEach((project) => {
      const position = { lat: Number(project.latitude), lng: Number(project.longitude) };`,
`    mappable.forEach((project) => {
      const latitude = Number(project.latitude);
      const longitude = Number(project.longitude);
      const position = { lat: latitude, lng: longitude };`,
"Google marker coordinates",
);

replaceOnce(
`        map.setZoom(PROJECT_FOCUS_ZOOM);
        map.panTo(position);`,
`        map.setCenter({ lat: latitude, lng: longitude });
        map.setZoom(PROJECT_FOCUS_ZOOM);`,
"Google marker click zoom",
);

fs.writeFileSync(file, source);
console.log("Applied project marker click-to-zoom behavior for Esri and Google satellite maps.");
