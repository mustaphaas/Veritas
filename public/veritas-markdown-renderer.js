(() => {
  function normalize(text) {
    return String(text || "")
      .replace(/&#x20;/gi, " ")
      .replace(/\\([*_#`|])/g, "$1")
      .replace(/\r\n/g, "\n")
      .trim();
  }

  function inline(container, text) {
    const parts = normalize(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
    for (const part of parts) {
      if (part.startsWith("**") && part.endsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        strong.style.fontWeight = "700";
        strong.style.color = "#173b2a";
        container.appendChild(strong);
      } else if (part.startsWith("`") && part.endsWith("`")) {
        const code = document.createElement("code");
        code.textContent = part.slice(1, -1);
        code.style.background = "#f1f5f3";
        code.style.padding = "1px 4px";
        code.style.borderRadius = "4px";
        code.style.fontSize = "0.92em";
        container.appendChild(code);
      } else {
        container.appendChild(document.createTextNode(part));
      }
    }
  }

  function isTableDivider(line) {
    return /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
  }

  function cells(line) {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  function appendTable(parent, lines, start) {
    const header = cells(lines[start]);
    const rows = [];
    let index = start + 2;
    while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
      rows.push(cells(lines[index]));
      index += 1;
    }

    const wrap = document.createElement("div");
    wrap.style.overflowX = "auto";
    wrap.style.margin = "10px 0";
    wrap.style.border = "1px solid #dfe9e2";
    wrap.style.borderRadius = "10px";

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "10px";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    header.forEach((value) => {
      const th = document.createElement("th");
      th.style.textAlign = "left";
      th.style.padding = "8px 10px";
      th.style.background = "#eef8f1";
      th.style.borderBottom = "1px solid #dfe9e2";
      inline(th, value);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((value) => {
        const td = document.createElement("td");
        td.style.padding = "8px 10px";
        td.style.borderBottom = "1px solid #edf2ef";
        td.style.verticalAlign = "top";
        inline(td, value);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    parent.appendChild(wrap);
    return index;
  }

  function renderMarkdown(text) {
    const root = document.createElement("div");
    root.dataset.veritasMarkdown = "true";
    root.style.whiteSpace = "normal";

    const lines = normalize(text).split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) {
        i += 1;
        continue;
      }

      if (i + 1 < lines.length && line.includes("|") && isTableDivider(lines[i + 1])) {
        i = appendTable(root, lines, i);
        continue;
      }

      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        const h = document.createElement(heading[1].length <= 2 ? "h3" : "h4");
        h.style.fontWeight = "700";
        h.style.color = "#173b2a";
        h.style.margin = "10px 0 5px";
        h.style.fontSize = heading[1].length <= 2 ? "12px" : "11px";
        inline(h, heading[2]);
        root.appendChild(h);
        i += 1;
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        const ul = document.createElement("ul");
        ul.style.paddingLeft = "18px";
        ul.style.margin = "6px 0";
        ul.style.listStyleType = "disc";
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          const li = document.createElement("li");
          li.style.margin = "3px 0";
          inline(li, lines[i].replace(/^\s*[-*]\s+/, ""));
          ul.appendChild(li);
          i += 1;
        }
        root.appendChild(ul);
        continue;
      }

      if (/^\d+[.)]\s+/.test(line)) {
        const ol = document.createElement("ol");
        ol.style.paddingLeft = "20px";
        ol.style.margin = "6px 0";
        ol.style.listStyleType = "decimal";
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          const li = document.createElement("li");
          li.style.margin = "3px 0";
          inline(li, lines[i].replace(/^\s*\d+[.)]\s+/, ""));
          ol.appendChild(li);
          i += 1;
        }
        root.appendChild(ol);
        continue;
      }

      const p = document.createElement("p");
      p.style.margin = "5px 0";
      inline(p, line);
      root.appendChild(p);
      i += 1;
    }

    return root;
  }

  function enhance() {
    document.querySelectorAll('p.whitespace-pre-wrap:not([data-veritas-rendered])').forEach((node) => {
      const bubble = node.parentElement;
      if (!bubble || !bubble.textContent?.includes("Veritas analysis")) return;
      const text = node.textContent || "";
      node.dataset.veritasRendered = "true";
      node.replaceWith(renderMarkdown(text));
    });
  }

  const observer = new MutationObserver(enhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhance, { once: true });
  } else {
    enhance();
  }
})();
