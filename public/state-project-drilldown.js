(() => {
  const STATE_TARGETS = {
    Abia: 8, Adamawa: 11, "Akwa Ibom": 9, Anambra: 14, Bauchi: 13,
    Bayelsa: 5, Benue: 12, Borno: 10, "Cross River": 9, Delta: 15,
    Ebonyi: 7, Edo: 13, Ekiti: 6, Enugu: 11, FCT: 8, Gombe: 10,
    Imo: 9, Jigawa: 12, Kaduna: 16, Kano: 20, Katsina: 15, Kebbi: 8,
    Kogi: 9, Kwara: 10, Lagos: 18, Nasarawa: 11, Niger: 14, Ogun: 15,
    Ondo: 8, Osun: 9, Oyo: 14, Plateau: 12, Rivers: 16, Sokoto: 11,
    Taraba: 7, Yobe: 8, Zamfara: 9,
  };

  const PROGRAMMES = ["NEP", "DARES", "AMP", "Others"];
  const COMPONENTS = ["Mini Grid", "Solar Home System", "Grid Extension", "Solar Street Light"];
  const CONTRACTORS = ["SunVolt Nigeria", "NorthGrid EPC", "Apex Power Works", "GreenTech Ltd"];
  const MONTHS = [
    "January 2024", "February 2024", "March 2024", "April 2024",
    "May 2024", "June 2024", "July 2024", "August 2024",
    "September 2024", "October 2024", "November 2024", "December 2024",
  ];
  const STATUSES = [
    { status: "Verified", verified: true },
    { status: "Verified", verified: true },
    { status: "Verified", verified: true },
    { status: "Submitted", verified: false },
    { status: "Pending", verified: false },
    { status: "In progress", verified: false },
  ];

  const SAMPLE_COORDINATES = {
    Kano: [8.5167, 12.0000],
    Kaduna: [7.4383, 10.5105],
    Lagos: [3.3792, 6.5244],
    FCT: [7.3986, 9.0765],
    Rivers: [7.0134, 4.8156],
    Oyo: [3.9470, 7.3775],
    Niger: [6.5569, 9.5836],
    Bauchi: [9.8442, 10.3158],
    Borno: [13.1510, 11.8469],
    Enugu: [7.4988, 6.4584],
    Plateau: [8.8965, 9.8965],
    Sokoto: [5.2476, 13.0059],
  };

  const projects = Object.entries(STATE_TARGETS).flatMap(([state, count], stateIndex) =>
    Array.from({ length: count }, (_, projectIndex) => {
      const seed = stateIndex * 37 + projectIndex * 11;
      const firstStateProject = projectIndex === 0;
      const status = STATUSES[seed % STATUSES.length];
      const component = firstStateProject
        ? "Mini Grid"
        : COMPONENTS[(seed + projectIndex * 2 + stateIndex) % COMPONENTS.length];
      const base = SAMPLE_COORDINATES[state];
      const coordinate = base && projectIndex < 3
        ? [
            base[0] + ((projectIndex % 2 ? 1 : -1) * (0.035 + projectIndex * 0.018)),
            base[1] + ((projectIndex % 2 ? -1 : 1) * (0.028 + projectIndex * 0.015)),
          ]
        : null;
      return {
        name: `${state} ${component} Project ${String(projectIndex + 1).padStart(2, "0")}`,
        state,
        programme: firstStateProject ? "NEP" : PROGRAMMES[(seed + projectIndex * 2) % PROGRAMMES.length],
        component,
        contractor: firstStateProject ? "SunVolt Nigeria" : CONTRACTORS[(seed + stateIndex) % CONTRACTORS.length],
        month: firstStateProject ? "June 2024" : MONTHS[(seed + projectIndex * 6) % MONTHS.length],
        status: status.status,
        verified: status.verified,
        kw: 120 + ((seed * 173 + projectIndex * 61) % 880),
        households: 80 + ((seed * 211 + projectIndex * 97) % 1420),
        coordinate,
        coordinateType: coordinate ? "Demo project coordinate" : null,
      };
    }),
  );

  const style = document.createElement("style");
  style.textContent = `
    svg[aria-label^="Interactive Nigeria state map"] path[role="button"]:not([data-drilldown-selected="true"]) { stroke:#9fc8aa !important; stroke-width:1.05px !important; }
    svg[aria-label^="Interactive Nigeria state map"] path[data-drilldown-selected="true"] { stroke:#075c33 !important; stroke-width:2.2px !important; filter:brightness(.96); }
    .veritas-demo-marker { cursor:pointer; filter:drop-shadow(0 2px 3px rgba(7,92,51,.25)); }
    .veritas-demo-marker circle:first-child { fill:#ffffff; stroke:#08733f; stroke-width:1.4; }
    .veritas-demo-marker circle:last-child { fill:#08733f; }
    .veritas-demo-marker:hover circle:first-child { fill:#eaf8ef; }
    .veritas-state-project-drawer { position:absolute; z-index:45; top:12px; right:12px; bottom:12px; width:min(410px,calc(100% - 24px)); display:flex; flex-direction:column; overflow:hidden; border:1px solid #cfdad2; border-radius:14px; background:rgba(255,255,255,.98); box-shadow:0 20px 50px rgba(20,55,37,.20); backdrop-filter:blur(10px); font-family:"Montserrat",Inter,ui-sans-serif,system-ui,sans-serif; }
    .veritas-state-project-drawer * { box-sizing:border-box; }
    .veritas-state-project-head { padding:16px 16px 13px; border-bottom:1px solid #e5ebe7; background:linear-gradient(180deg,#fbfdfb 0%,#f5faf7 100%); }
    .veritas-state-project-title-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
    .veritas-state-project-title { margin:0; font-size:16px; line-height:1.2; font-weight:600; color:#173b2a; }
    .veritas-state-project-subtitle { margin:4px 0 0; font-size:10px; color:#728078; }
    .veritas-state-project-close { width:30px; height:30px; display:flex; align-items:center; justify-content:center; border:1px solid #dfe6e1; border-radius:8px; background:white; color:#617168; cursor:pointer; }
    .veritas-state-project-close:hover { border-color:#9fc8aa; color:#08733f; background:#f4faf6; }
    .veritas-state-project-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; margin-top:13px; }
    .veritas-state-project-stat { border:1px solid #e2e8e4; border-radius:9px; background:white; padding:8px 7px; text-align:center; }
    .veritas-state-project-stat strong { display:block; font-size:14px; font-weight:600; color:#08733f; }
    .veritas-state-project-stat span { display:block; margin-top:2px; font-size:8px; color:#77847d; }
    .veritas-state-project-search { padding:10px 12px; border-bottom:1px solid #e8ece9; background:white; }
    .veritas-state-project-search input { width:100%; height:34px; border:1px solid #dce4de; border-radius:8px; background:#fafcfb; padding:0 10px; outline:none; font:500 10px/1 "Montserrat",Inter,sans-serif; color:#253a2f; }
    .veritas-state-project-search input:focus { border-color:#7fbd92; box-shadow:0 0 0 2px rgba(8,115,63,.08); background:white; }
    .veritas-state-project-list { flex:1; min-height:0; overflow:auto; padding:8px 12px 12px; }
    .veritas-state-project-row { padding:11px 3px; border-bottom:1px solid #edf0ee; }
    .veritas-state-project-row:last-child { border-bottom:0; }
    .veritas-state-project-row-top { display:flex; align-items:flex-start; gap:8px; }
    .veritas-state-project-dot { width:8px; height:8px; flex:0 0 8px; margin-top:4px; border-radius:999px; }
    .veritas-state-project-name { min-width:0; flex:1; margin:0; font-size:10.5px; line-height:1.35; font-weight:600; color:#233d30; }
    .veritas-state-project-status { flex:none; border-radius:999px; padding:3px 6px; font-size:7.5px; font-weight:600; white-space:nowrap; }
    .veritas-state-project-meta { margin:5px 0 0 16px; font-size:8.5px; line-height:1.45; color:#758179; }
    .veritas-state-project-metrics { display:flex; flex-wrap:wrap; gap:6px 10px; margin:6px 0 0 16px; font-size:8.5px; color:#53665b; }
    .veritas-coordinate-note { color:#08733f; font-weight:600; }
    .veritas-state-project-empty { padding:34px 16px; text-align:center; font-size:10px; line-height:1.6; color:#728078; }
    .veritas-state-project-foot { padding:9px 12px; border-top:1px solid #e6ebe7; background:#fafcfb; font-size:8.5px; text-align:center; color:#738078; }
    @media (max-width:700px) { .veritas-state-project-drawer { left:12px; width:auto; } }
  `;
  document.head.appendChild(style);

  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function currentFilter(labelText) {
    for (const label of document.querySelectorAll("label")) {
      const title = label.querySelector("span")?.textContent?.trim();
      if (title === labelText) return label.querySelector("select")?.value || "";
    }
    return "";
  }

  function filteredProjectsForState(state) {
    const programme = currentFilter("Programme");
    const component = currentFilter("Component");
    const contractor = currentFilter("Contractor");
    const month = currentFilter("Month");
    return projects.filter((project) =>
      project.state === state &&
      (!programme || programme === "All Programmes" || project.programme === programme) &&
      (!component || component === "All Components" || project.component === component) &&
      (!contractor || contractor === "All Contractors" || project.contractor === contractor) &&
      (!month || month === "All Months" || project.month === month),
    );
  }

  function statusTheme(project) {
    if (project.verified) return { dot: "#159455", bg: "#eaf8ef", fg: "#08733f" };
    if (project.status === "Pending") return { dot: "#d69400", bg: "#fff5dd", fg: "#946300" };
    if (project.status === "Submitted") return { dot: "#4c8b62", bg: "#eff8f2", fg: "#39764d" };
    return { dot: "#4775c5", bg: "#edf4fd", fg: "#315f9d" };
  }

  function hideLegacyStatePanel(svg) {
    const mapGrid = svg?.parentElement?.parentElement;
    if (!mapGrid) return;
    const legacy = mapGrid.querySelector('aside[aria-label$=" state details"]');
    if (legacy) legacy.style.display = "none";
    mapGrid.style.gridTemplateColumns = "minmax(0, 1fr)";
  }

  function clearSelectedStateHighlight(svg) {
    svg?.querySelectorAll('path[role="button"]').forEach((path) => path.removeAttribute("data-drilldown-selected"));
  }

  function renderRows(container, stateProjects, query = "") {
    const needle = query.trim().toLowerCase();
    const rows = needle
      ? stateProjects.filter((project) => [project.name, project.programme, project.component, project.contractor, project.status].join(" ").toLowerCase().includes(needle))
      : stateProjects;
    if (!rows.length) {
      container.innerHTML = '<div class="veritas-state-project-empty">No projects match this state and the current dashboard filters.</div>';
      return;
    }
    container.innerHTML = rows.map((project) => {
      const theme = statusTheme(project);
      const coordinate = project.coordinate
        ? `<span class="veritas-coordinate-note">${project.coordinate[1].toFixed(4)}, ${project.coordinate[0].toFixed(4)} · demo coordinate</span>`
        : "";
      return `<article class="veritas-state-project-row">
        <div class="veritas-state-project-row-top">
          <span class="veritas-state-project-dot" style="background:${theme.dot}"></span>
          <p class="veritas-state-project-name">${escapeHtml(project.name)}</p>
          <span class="veritas-state-project-status" style="background:${theme.bg};color:${theme.fg}">${escapeHtml(project.status)}</span>
        </div>
        <p class="veritas-state-project-meta">${escapeHtml(project.programme)} · ${escapeHtml(project.component)} · ${escapeHtml(project.contractor)}</p>
        <div class="veritas-state-project-metrics">
          <span>${(project.kw / 1000).toFixed(2)} MW</span>
          <span>${project.households.toLocaleString()} households</span>
          <span>${escapeHtml(project.month)}</span>
          ${coordinate}
        </div>
      </article>`;
    }).join("");
  }

  function openStateProjects(state, clickedPath, svg) {
    hideLegacyStatePanel(svg);
    clearSelectedStateHighlight(svg);
    if (clickedPath) clickedPath.setAttribute("data-drilldown-selected", "true");
    const mapContainer = svg.parentElement;
    if (!mapContainer) return;
    mapContainer.querySelector(".veritas-state-project-drawer")?.remove();
    const stateProjects = filteredProjectsForState(state);
    const verified = stateProjects.filter((project) => project.verified).length;
    const pending = stateProjects.length - verified;
    const capacityMw = stateProjects.reduce((sum, project) => sum + project.kw, 0) / 1000;
    const geocoded = stateProjects.filter((project) => project.coordinate).length;
    const drawer = document.createElement("section");
    drawer.className = "veritas-state-project-drawer";
    drawer.setAttribute("aria-label", `${state} project list`);
    drawer.innerHTML = `<div class="veritas-state-project-head">
      <div class="veritas-state-project-title-row"><div>
        <h3 class="veritas-state-project-title">${escapeHtml(state)} State Projects</h3>
        <p class="veritas-state-project-subtitle">${stateProjects.length.toLocaleString()} projects · ${geocoded} coordinate-backed demo point(s)</p>
      </div><button class="veritas-state-project-close" type="button" aria-label="Close ${escapeHtml(state)} projects">×</button></div>
      <div class="veritas-state-project-summary">
        <div class="veritas-state-project-stat"><strong>${verified}</strong><span>Verified</span></div>
        <div class="veritas-state-project-stat"><strong>${pending}</strong><span>Pending</span></div>
        <div class="veritas-state-project-stat"><strong>${capacityMw.toFixed(1)} MW</strong><span>Capacity</span></div>
      </div></div>
      <div class="veritas-state-project-search"><input type="search" placeholder="Search projects, programme or contractor" aria-label="Search ${escapeHtml(state)} projects" /></div>
      <div class="veritas-state-project-list"></div>
      <div class="veritas-state-project-foot">Green map markers are presentation sample coordinates, not verified field evidence coordinates.</div>`;
    mapContainer.appendChild(drawer);
    const list = drawer.querySelector(".veritas-state-project-list");
    const search = drawer.querySelector('input[type="search"]');
    renderRows(list, stateProjects);
    search?.addEventListener("input", () => renderRows(list, stateProjects, search.value));
    drawer.querySelector(".veritas-state-project-close")?.addEventListener("click", () => {
      drawer.remove();
      clearSelectedStateHighlight(svg);
    });
  }

  function mapStateFromPath(path) {
    const label = path.getAttribute("aria-label") || "";
    const separator = label.indexOf(":");
    return separator > 0 ? label.slice(0, separator).trim() : "";
  }

  function projectToPoint([longitude, latitude]) {
    const minLon = 2.5, maxLon = 15, minLat = 3.5, maxLat = 14;
    const width = 650, height = 300;
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

  function ensureMarkers(svg) {
    if (!svg || svg.querySelector("g[data-veritas-project-markers]")) return;
    const hostGroup = svg.querySelector("g[transform]");
    if (!hostGroup) return;
    const markerGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    markerGroup.setAttribute("data-veritas-project-markers", "true");
    projects.filter((project) => project.coordinate).forEach((project) => {
      const point = projectToPoint(project.coordinate);
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "g");
      marker.setAttribute("class", "veritas-demo-marker");
      marker.setAttribute("transform", `translate(${point.x} ${point.y})`);
      marker.setAttribute("role", "button");
      marker.setAttribute("tabindex", "0");
      marker.setAttribute("aria-label", `${project.name}: demo coordinate`);
      marker.dataset.state = project.state;
      marker.innerHTML = '<circle r="5.5"></circle><circle r="2.2"></circle>';
      marker.addEventListener("click", (event) => {
        event.stopPropagation();
        const statePath = [...svg.querySelectorAll('path[role="button"]')].find((path) => mapStateFromPath(path) === project.state);
        openStateProjects(project.state, statePath || null, svg);
      });
      markerGroup.appendChild(marker);
    });
    hostGroup.appendChild(markerGroup);
  }

  document.addEventListener("click", (event) => {
    const path = event.target instanceof Element
      ? event.target.closest('svg[aria-label^="Interactive Nigeria state map"] path[role="button"]')
      : null;
    if (!path) return;
    const svg = path.closest('svg[aria-label^="Interactive Nigeria state map"]');
    const state = mapStateFromPath(path);
    if (!svg || !state || !STATE_TARGETS[state]) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    openStateProjects(state, path, svg);
  }, true);

  const observer = new MutationObserver(() => {
    const svg = document.querySelector('svg[aria-label^="Interactive Nigeria state map"]');
    if (svg) {
      hideLegacyStatePanel(svg);
      ensureMarkers(svg);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("load", () => {
    const svg = document.querySelector('svg[aria-label^="Interactive Nigeria state map"]');
    if (svg) {
      hideLegacyStatePanel(svg);
      ensureMarkers(svg);
    }
  });
})();