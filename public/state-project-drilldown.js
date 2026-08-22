(() => {
  const WORKFLOW_COORDINATES = {
    Kano: [8.5920, 12.0022],
    Kaduna: [7.4165, 10.5105],
    Katsina: [7.6018, 12.9908],
    Sokoto: [5.2476, 13.0059],
    Zamfara: [6.6597, 12.1704],
    Jigawa: [9.5616, 12.2280],
    Lagos: [3.3792, 6.5244],
    Ogun: [3.3619, 7.1475],
    Oyo: [3.9470, 7.3775],
    FCT: [7.3986, 9.0765],
    Rivers: [7.0498, 4.8156],
    Enugu: [7.5464, 6.4584],
  };

  const SUPPLEMENTAL_OFFSETS = [
    [0.053, -0.043],
    [-0.071, 0.058],
  ];

  const style = document.createElement("style");
  style.textContent = `
    svg[aria-label^="Interactive Nigeria state map"] path[role="button"]:not([data-drilldown-selected="true"]) {
      stroke: #9fc8aa !important;
      stroke-width: 1.05px !important;
    }
    .veritas-demo-marker {
      cursor: pointer;
      filter: drop-shadow(0 2px 3px rgba(7, 92, 51, 0.25));
    }
    .veritas-demo-marker circle:first-child {
      fill: #ffffff;
      stroke: #08733f;
      stroke-width: 1.4;
    }
    .veritas-demo-marker circle:last-child {
      fill: #08733f;
    }
    .veritas-demo-marker[data-coordinate-source="workflow"] circle:first-child {
      fill: #eaf8ef;
      stroke-width: 1.7;
    }
    .veritas-demo-marker:hover circle:first-child {
      fill: #dff3e5;
    }
  `;
  document.head.appendChild(style);

  function mapStateFromPath(path) {
    const label = path.getAttribute("aria-label") || "";
    const separator = label.indexOf(":");
    return separator > 0 ? label.slice(0, separator).trim() : "";
  }

  function projectToPoint([longitude, latitude]) {
    const minLon = 2.5;
    const maxLon = 15;
    const minLat = 3.5;
    const maxLat = 14;
    const width = 650;
    const height = 300;
    const meanLatRadians = (((minLat + maxLat) / 2) * Math.PI) / 180;
    const correction = Math.cos(meanLatRadians);
    const lonSpanAdjusted = (maxLon - minLon) * correction;
    const latSpan = maxLat - minLat;
    const scale = Math.min(width / lonSpanAdjusted, height / latSpan);
    const offsetX = (width - lonSpanAdjusted * scale) / 2;
    const offsetY = (height - latSpan * scale) / 2;
    return {
      x: (longitude - minLon) * correction * scale + offsetX,
      y: height - offsetY - (latitude - minLat) * scale,
    };
  }

  function restoreNativeStateLayout(svg) {
    const mapGrid = svg?.parentElement?.parentElement;
    if (!mapGrid) return;

    // PR #22 temporarily forced the map to a single full-width column.
    // Remove that override so the original 290px state-details panel controls
    // the map footprint again whenever a state is selected.
    mapGrid.style.removeProperty("grid-template-columns");

    const stateAside = mapGrid.querySelector('aside[aria-label$=" state details"]');
    if (stateAside) stateAside.style.removeProperty("display");

    // Remove any stale overlay drawer left by an older cached script.
    svg.parentElement?.querySelector(".veritas-state-project-drawer")?.remove();
  }

  function fitMapWithoutClosingState(svg) {
    // Keep the selected state/details panel, but restore the original map scale
    // and centre after React handles the state click.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        restoreNativeStateLayout(svg);
        const fitButton = svg.parentElement?.querySelector(
          'button[aria-label="Fit map to Nigeria"]',
        );
        if (fitButton instanceof HTMLButtonElement) fitButton.click();
      });
    });
  }

  function ensureMarkers(svg) {
    if (!svg || svg.querySelector("g[data-veritas-project-markers]")) return;
    const hostGroup = svg.querySelector("g[transform]");
    if (!hostGroup) return;

    const markerGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    markerGroup.setAttribute("data-veritas-project-markers", "true");

    Object.entries(WORKFLOW_COORDINATES).forEach(([state, base]) => {
      const points = [
        {
          coordinate: base,
          source: "workflow",
          label: `${state} project-centre coordinate`,
        },
        ...SUPPLEMENTAL_OFFSETS.map(([dx, dy], index) => ({
          coordinate: [base[0] + dx, base[1] + dy],
          source: "supplemental",
          label: `${state} supplemental presentation project ${index + 1}`,
        })),
      ];

      points.forEach(({ coordinate, source, label }) => {
        const point = projectToPoint(coordinate);
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "g");
        marker.setAttribute("class", "veritas-demo-marker");
        marker.setAttribute("transform", `translate(${point.x} ${point.y})`);
        marker.setAttribute("role", "button");
        marker.setAttribute("tabindex", "0");
        marker.setAttribute("aria-label", label);
        marker.dataset.state = state;
        marker.dataset.coordinateSource = source;
        marker.innerHTML = '<circle r="5.5"></circle><circle r="2.2"></circle>';

        const selectState = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const statePath = [...svg.querySelectorAll('path[role="button"]')].find(
            (path) => mapStateFromPath(path) === state,
          );
          if (!statePath) return;
          statePath.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
            }),
          );
        };

        marker.addEventListener("click", selectState);
        marker.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") selectState(event);
        });
        markerGroup.appendChild(marker);
      });
    });

    hostGroup.appendChild(markerGroup);
  }

  function handleStateInteraction(event) {
    const target = event.target instanceof Element ? event.target : null;
    const path = target?.closest(
      'svg[aria-label^="Interactive Nigeria state map"] path[role="button"]',
    );
    if (!path) return;
    const svg = path.closest('svg[aria-label^="Interactive Nigeria state map"]');
    if (!svg) return;
    fitMapWithoutClosingState(svg);
  }

  // Let React handle state selection normally so the original state-information
  // panel remains authoritative. We only restore the map scale afterwards.
  document.addEventListener("click", handleStateInteraction, false);
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" || event.key === " ") handleStateInteraction(event);
    },
    false,
  );

  const observer = new MutationObserver(() => {
    const svg = document.querySelector('svg[aria-label^="Interactive Nigeria state map"]');
    if (!svg) return;
    restoreNativeStateLayout(svg);
    ensureMarkers(svg);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("load", () => {
    const svg = document.querySelector('svg[aria-label^="Interactive Nigeria state map"]');
    if (!svg) return;
    restoreNativeStateLayout(svg);
    ensureMarkers(svg);
  });
})();
