(() => {
  const CONTRACTOR_SUMMARY_ID = "overview-contractor-exception-summary";
  const EXPORT_BUTTON_ID = "overview-download-brief";

  function text(node) {
    return String(node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function formatTimestamp(date = new Date()) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date).replace(",", " ·");
  }

  function findContractorSelect() {
    const labels = [...document.querySelectorAll("label")];
    const label = labels.find((item) =>
      /contractor/i.test(text(item.querySelector("span")) || text(item)),
    );
    return label?.querySelector("select") || null;
  }

  function contractorNames() {
    const select = findContractorSelect();
    if (!select) return [];
    return [...select.options]
      .map((option) => text(option))
      .filter((value) => value && !/^all/i.test(value));
  }

  function attentionContractors(names) {
    const rows = [...document.querySelectorAll("tr")];
    const result = new Set();
    for (const row of rows) {
      const rowText = text(row);
      if (!/(pending|awaiting|re-inspection|overdue)/i.test(rowText)) continue;
      for (const name of names) {
        if (rowText.includes(name)) result.add(name);
      }
    }
    return result;
  }

  function openContractors() {
    const navButton = [...document.querySelectorAll("button")].find(
      (button) => text(button) === "Contractors",
    );
    navButton?.click();
  }

  function currentFilters() {
    return [...document.querySelectorAll("label")]
      .map((label) => {
        const select = label.querySelector("select");
        if (!select) return null;
        const name = text(label.querySelector("span"));
        const value = text(select.selectedOptions?.[0]) || select.value;
        return name && value ? `${name}: ${value}` : null;
      })
      .filter(Boolean);
  }

  function kpiLines() {
    const candidates = [...document.querySelectorAll("section article, section button")];
    return candidates
      .map((node) => text(node))
      .filter((value) =>
        /^(Projects|Installed Capacity|Households Reached|Verification Rate|Pending Verification)\b/i.test(
          value,
        ),
      )
      .slice(0, 5);
  }

  function programmeLines() {
    const heading = [...document.querySelectorAll("h2, h3")].find((node) =>
      /programme performance/i.test(text(node)),
    );
    const section = heading?.closest("section");
    if (!section) return [];
    const rows = [...section.querySelectorAll("tr")].map((row) => text(row));
    return rows.filter(Boolean).slice(0, 10);
  }

  function projectLines() {
    const rows = [...document.querySelectorAll("tr")]
      .map((row) => text(row))
      .filter((value) => value && !/programme performance/i.test(value));
    return rows.slice(0, 12);
  }

  function downloadOverview() {
    const names = contractorNames();
    const attention = attentionContractors(names);
    const stamp = formatTimestamp();
    const lines = [
      "REA NATIONAL PROJECT OVERVIEW",
      `Generated: ${stamp}`,
      "",
      "FILTERS",
      ...currentFilters().map((item) => `- ${item}`),
      "",
      "KEY PERFORMANCE INDICATORS",
      ...kpiLines().map((item) => `- ${item}`),
      "",
      "CONTRACTOR EXCEPTION SUMMARY",
      `- ${names.length} contractor${names.length === 1 ? "" : "s"} in current portfolio`,
      `- ${attention.size} require${attention.size === 1 ? "s" : ""} attention based on visible pending/awaiting/re-inspection/overdue records`,
      ...(attention.size ? [...attention].map((name) => `  • ${name}`) : []),
      "",
      "PROGRAMME PERFORMANCE",
      ...programmeLines().map((item) => `- ${item}`),
      "",
      "VISIBLE PROJECT RECORDS",
      ...projectLines().map((item) => `- ${item}`),
      "",
      "Generated from the current filtered Veritas Overview for management briefing purposes.",
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `REA-Overview-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function updateFreshness() {
    const labels = [...document.querySelectorAll("span")].filter((node) =>
      /^Last updated:/i.test(text(node)),
    );
    labels.forEach((node) => {
      node.textContent = `Last updated: ${formatTimestamp()}`;
    });
  }

  function ensureExportButton() {
    if (document.getElementById(EXPORT_BUTTON_ID)) return;
    const freshness = [...document.querySelectorAll("span")].find((node) =>
      /^Last updated:/i.test(text(node)),
    );
    if (!freshness) return;

    const button = document.createElement("button");
    button.id = EXPORT_BUTTON_ID;
    button.type = "button";
    button.className = "overview-executive-brief-button";
    button.setAttribute("aria-label", "Download current REA overview briefing");
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>Download Overview</span>
    `;
    button.addEventListener("click", downloadOverview);
    freshness.insertAdjacentElement("afterend", button);
  }

  function ensureContractorSummary() {
    const names = contractorNames();
    if (!names.length) return;
    const attention = attentionContractors(names);

    let summary = document.getElementById(CONTRACTOR_SUMMARY_ID);
    if (!summary) {
      const filterSection = findContractorSelect()?.closest("section");
      if (!filterSection) return;
      summary = document.createElement("div");
      summary.id = CONTRACTOR_SUMMARY_ID;
      summary.className = "overview-contractor-summary";
      filterSection.insertAdjacentElement("afterend", summary);
    }

    const attentionLabel = attention.size === 1 ? "1 requires attention" : `${attention.size} require attention`;
    summary.innerHTML = `
      <div class="overview-contractor-summary__copy">
        <span class="overview-contractor-summary__dot" aria-hidden="true"></span>
        <strong>${names.length} contractor${names.length === 1 ? "" : "s"}</strong>
        <span aria-hidden="true">·</span>
        <span class="${attention.size ? "is-attention" : ""}">${attentionLabel}</span>
      </div>
      <button type="button" class="overview-contractor-summary__link">View contractors <span aria-hidden="true">→</span></button>
    `;
    summary.querySelector("button")?.addEventListener("click", openContractors, { once: true });
  }

  function apply() {
    updateFreshness();
    ensureExportButton();
    ensureContractorSummary();
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
  window.setInterval(updateFreshness, 60_000);
})();
