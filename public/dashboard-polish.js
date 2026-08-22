(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  function ensureStylesheet() {
    if (document.querySelector('link[data-veritas-dashboard-polish]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/dashboard-polish.css";
    link.dataset.veritasDashboardPolish = "true";
    document.head.appendChild(link);
  }

  function svgIcon(kind) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const paths = {
      total: [
        '<path d="M4 6.5h6l1.6 2H20v9.5H4z"/>',
        '<path d="M4 9h16"/>',
      ],
      solar: [
        '<circle cx="18" cy="5" r="2.3"/>',
        '<path d="M18 1v1M18 8v1M14 5h1M21 5h1M15.2 2.2l.7.7M20.1 7.1l.7.7M20.8 2.2l-.7.7M15.9 7.1l-.7.7"/>',
        '<path d="M3.5 9.5h11l2 8h-15l2-8Z"/>',
        '<path d="M4.5 13.5h11M8.5 9.5l-1 8M12 9.5l1 8M9 17.5v3M13 17.5v3M7 20.5h8"/>',
      ],
      verified: [
        '<circle cx="12" cy="12" r="8"/>',
        '<path d="m8.5 12 2.2 2.3 4.8-5"/>',
      ],
      pending: [
        '<circle cx="12" cy="12" r="8"/>',
        '<path d="M12 7.5V12l3 1.8"/>',
      ],
      submitted: [
        '<path d="M5 4.5h9l4 4V19.5H5z"/>',
        '<path d="M14 4.5v4h4"/>',
        '<path d="m8 14 2 2 4-4"/>',
      ],
    };
    svg.innerHTML = (paths[kind] || paths.total).join("");
    return svg;
  }

  function makeIcon(kind) {
    const span = document.createElement("span");
    span.className = "veritas-metric-icon";
    span.dataset.metricIcon = kind;
    span.appendChild(svgIcon(kind));
    return span;
  }

  function decorateCapacityKpi() {
    const label = [...document.querySelectorAll("p")].find(
      (element) => element.textContent?.trim() === "Installed Capacity",
    );
    const card = label?.closest("article, section, div[class*='rounded']");
    if (!card) return;

    const iconHost = [...card.querySelectorAll("div")].find((element) => {
      const svg = element.querySelector(":scope > svg");
      return Boolean(svg) && element.children.length <= 2;
    });
    if (!iconHost) return;

    let solar = iconHost.querySelector('[data-veritas-capacity-solar="true"]');
    if (!solar) {
      iconHost.replaceChildren();
      solar = document.createElement("span");
      solar.dataset.veritasCapacitySolar = "true";
      solar.style.display = "inline-flex";
      solar.style.width = "24px";
      solar.style.height = "24px";
      solar.style.alignItems = "center";
      solar.style.justifyContent = "center";
      solar.style.color = "#08733f";
      solar.appendChild(svgIcon("solar"));
      iconHost.appendChild(solar);
    }
  }

  function removeReaSloganSection() {
    const slogans = [...document.querySelectorAll("p")].filter((element) =>
      element.textContent?.includes("Reliable power. Stronger communities. A brighter Nigeria."),
    );

    slogans.forEach((slogan) => {
      const legacyFooter = slogan.closest("footer");
      if (legacyFooter && !legacyFooter.classList.contains("veritas-footer")) {
        legacyFooter.remove();
        return;
      }

      const legacyCard = slogan.closest("section, article");
      if (legacyCard) legacyCard.remove();
    });

    [...document.querySelectorAll("p, span")]
      .filter((element) => element.textContent?.includes("Last updated: Today, 4:07 AM"))
      .forEach((element) => {
        const legacyFooter = element.closest("footer");
        if (legacyFooter && !legacyFooter.classList.contains("veritas-footer")) {
          legacyFooter.remove();
        }
      });
  }

  function decorateQuickActions() {
    const heading = [...document.querySelectorAll("h2")].find(
      (element) => element.textContent?.trim() === "Quick Actions",
    );
    const article = heading?.closest("article");
    if (!article) return;
    article.classList.add("veritas-modern-quick-actions");
  }

  function decorateProjectMetrics() {
    const heading = [...document.querySelectorAll("h2")].find(
      (element) => element.textContent?.trim() === "Projects Across Nigeria",
    );
    const article = heading?.closest("article");
    if (!article) return;
    article.classList.add("veritas-project-metrics");

    const directChildren = [...article.children];
    const totalValue = directChildren.find(
      (element) => element.matches?.("p.text-4xl"),
    );
    const totalLabel = totalValue?.nextElementSibling;
    const statusGrid = directChildren.find((element) =>
      element.matches?.("div.mt-5.grid.grid-cols-3"),
    );

    let totalShell = article.querySelector(":scope > .veritas-metric-total-shell");
    if (!totalShell && totalValue && totalLabel) {
      totalShell = document.createElement("div");
      totalShell.className = "veritas-metric-total-shell";
      totalShell.innerHTML =
        '<p class="veritas-metric-value"></p><p class="veritas-metric-label">Total Projects</p>';
      totalShell.prepend(makeIcon("total"));
      statusGrid ? article.insertBefore(totalShell, statusGrid) : article.appendChild(totalShell);
    }
    const shellValue = totalShell?.querySelector(".veritas-metric-value");
    if (shellValue && totalValue) shellValue.textContent = totalValue.textContent?.trim() || "0";

    if (!statusGrid) return;
    const kinds = ["verified", "pending", "submitted"];
    [...statusGrid.children].forEach((cell, index) => {
      const kind = kinds[index] || "total";
      if (!cell.querySelector(`.veritas-metric-icon[data-metric-icon="${kind}"]`)) {
        cell.prepend(makeIcon(kind));
      }
    });
  }

  function apply() {
    ensureStylesheet();
    removeReaSloganSection();
    decorateCapacityKpi();
    decorateQuickActions();
    decorateProjectMetrics();
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }
  window.addEventListener("load", schedule, { once: true });
})();
