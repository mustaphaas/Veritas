(() => {
  const style = document.createElement("style");
  style.textContent = `
    svg[aria-label^="Interactive Nigeria state map"] path[role="button"]:not([data-drilldown-selected="true"]) {
      stroke: #9fc8aa !important;
      stroke-width: 1.05px !important;
    }
  `;
  document.head.appendChild(style);

  function restoreNativeStateLayout(svg) {
    const mapGrid = svg?.parentElement?.parentElement;
    if (!mapGrid) return;

    // Preserve the original state-details layout and map footprint.
    mapGrid.style.removeProperty("grid-template-columns");

    const stateAside = mapGrid.querySelector('aside[aria-label$=" state details"]');
    if (stateAside) stateAside.style.removeProperty("display");

    // Remove stale UI left by earlier map overlays or cached marker scripts.
    svg.parentElement?.querySelector(".veritas-state-project-drawer")?.remove();
    svg.querySelector("g[data-veritas-project-markers]")?.remove();
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

  // Let React handle state selection normally so the native state-information
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
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("load", () => {
    const svg = document.querySelector('svg[aria-label^="Interactive Nigeria state map"]');
    if (!svg) return;
    restoreNativeStateLayout(svg);
  });
})();
