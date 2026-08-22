(() => {
  const originalFetch = window.fetch.bind(window);

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function frontendSnapshot() {
    const root = document.querySelector("main") || document.querySelector("#root");
    if (!root) {
      return {
        mode: "frontend-testing",
        route: window.location.pathname,
        capturedAt: new Date().toISOString(),
        visibleText: "Frontend root was not available.",
      };
    }

    const clone = root.cloneNode(true);
    clone
      .querySelectorAll(
        'script, style, input, textarea, form, [aria-label="Veritas intelligence assistant"], [data-veritas-sensitive], [type="password"]',
      )
      .forEach((node) => node.remove());

    const selections = [...document.querySelectorAll("select")]
      .map((select) => {
        const label = select.closest("label")?.querySelector("span")?.textContent;
        const selected = select.selectedOptions?.[0]?.textContent || select.value;
        return {
          label: cleanText(label) || select.getAttribute("aria-label") || "Filter",
          value: cleanText(selected),
        };
      })
      .filter((item) => item.value);

    const headings = [...root.querySelectorAll("h1, h2, h3")]
      .map((node) => cleanText(node.textContent))
      .filter(Boolean)
      .slice(0, 80);

    const tables = [...root.querySelectorAll("table")]
      .map((table, index) => ({
        index: index + 1,
        text: cleanText(table.textContent).slice(0, 8000),
      }))
      .filter((table) => table.text);

    return {
      mode: "frontend-testing",
      authority:
        "This snapshot is the authoritative source for the current testing question. Prefer it over older demo/static data.",
      route: window.location.pathname,
      pageTitle: document.title,
      capturedAt: new Date().toISOString(),
      selections,
      headings,
      tables,
      visibleText: cleanText(clone.textContent).slice(0, 30000),
    };
  }

  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    const isVeritas = url === "/api/veritas" || url.endsWith("/api/veritas");

    if (!isVeritas || !init?.body || typeof init.body !== "string") {
      return originalFetch(input, init);
    }

    try {
      const body = JSON.parse(init.body);
      body.databaseContext = {
        dataScope:
          "Live rendered frontend snapshot for testing. Do not use historical static demo records unless they are visibly present in this snapshot.",
        frontendSnapshot: frontendSnapshot(),
      };

      return originalFetch(input, {
        ...init,
        body: JSON.stringify(body),
      });
    } catch {
      return originalFetch(input, init);
    }
  };
})();
