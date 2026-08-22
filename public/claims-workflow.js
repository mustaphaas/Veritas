(() => {
  const STORAGE_KEY = "rea-claims-workflow-v1";
  const consultants = [
    "North Central Verification Team",
    "North West Verification Team",
    "North East Verification Team",
    "South West Verification Team",
    "South East Verification Team",
    "South South Verification Team",
  ];

  const sampleClaims = [
    { id:"CLM-2026-001", contractor:"SunVolt Nigeria", programme:"DARES", component:"Mini Grid", project:"Kano Kumbotso Mini Grid", state:"Kano", lga:"Kumbotso", latitude:11.9581, longitude:8.5224, amount:184500000, completion:100, source:"REA API", status:"Ready for assignment", consultant:"" },
    { id:"CLM-2026-002", contractor:"GreenTech Ltd", programme:"NEP", component:"Solar Home System", project:"Kaduna Birnin Gwari SHS Lot 3", state:"Kaduna", lga:"Birnin Gwari", latitude:10.6639, longitude:6.5401, amount:96800000, completion:100, source:"Excel/CSV", status:"Assigned", consultant:"North West Verification Team" },
    { id:"CLM-2026-003", contractor:"Apex Power Works", programme:"DARES", component:"Grid Extension", project:"Nasarawa Lafia Grid Extension", state:"Nasarawa", lga:"Lafia", latitude:8.4939, longitude:8.5153, amount:247350000, completion:95, source:"REA API", status:"Needs review", consultant:"" },
    { id:"CLM-2026-004", contractor:"NorthGrid EPC", programme:"AMP", component:"Solar Street Light", project:"Borno Maiduguri Solar Street Light Lot 2", state:"Borno", lga:"Maiduguri", latitude:11.8333, longitude:13.1500, amount:76400000, completion:100, source:"Excel/CSV", status:"Assigned", consultant:"North East Verification Team" },
    { id:"CLM-2026-005", contractor:"SunVolt Nigeria", programme:"NEP", component:"Mini Grid", project:"Abia Umuahia Mini Grid", state:"Abia", lga:"Umuahia North", latitude:5.5320, longitude:7.4860, amount:132700000, completion:100, source:"REA API", status:"Ready for assignment", consultant:"" },
    { id:"CLM-2026-006", contractor:"GreenTech Ltd", programme:"DARES", component:"Solar Home System", project:"Oyo Ibarapa SHS Lot 1", state:"Oyo", lga:"Ibarapa East", latitude:7.4415, longitude:3.9994, amount:112250000, completion:98, source:"Excel/CSV", status:"Needs review", consultant:"" },
  ];

  const money = (value) => new Intl.NumberFormat("en-NG", { style:"currency", currency:"NGN", maximumFractionDigits:0 }).format(Number(value) || 0);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const uid = () => `CLM-${new Date().getFullYear()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;

  function loadClaims() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return Array.isArray(saved) && saved.length ? saved : sampleClaims;
    } catch { return sampleClaims; }
  }

  let claims = loadClaims();
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(claims));

  function csvRows(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i], next = text[i + 1];
      if (ch === '"' && quoted && next === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { row.push(cell); cell = ""; }
      else if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && next === '\n') i += 1;
        row.push(cell); if (row.some((v) => v.trim())) rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); if (row.some((v) => v.trim())) rows.push(row); }
    return rows;
  }

  function normalizeRecord(raw, source) {
    const get = (...keys) => {
      const found = Object.keys(raw).find((key) => keys.some((candidate) => key.trim().toLowerCase() === candidate));
      return found ? raw[found] : "";
    };
    return {
      id: get("claim id","claim_id","id") || uid(),
      contractor: get("contractor","contractor name","company"),
      programme: get("programme","program","type of program","type of programme"),
      component: get("component","technology","project component"),
      project: get("project","project name","site"),
      state: get("state"),
      lga: get("lga","local government","local government area"),
      latitude: Number(get("latitude","lat")) || 0,
      longitude: Number(get("longitude","lng","lon","long")) || 0,
      amount: Number(String(get("amount","claim amount","amount claimed")).replace(/[^0-9.-]/g,"")) || 0,
      completion: Number(String(get("completion","completion %","percent complete","percentage completion")).replace(/[^0-9.-]/g,"")) || 100,
      source,
      status:"Ready for assignment",
      consultant:"",
    };
  }

  function parseCsv(text, source = "Excel/CSV") {
    const rows = csvRows(text);
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => h.trim());
    return rows.slice(1).map((values) => normalizeRecord(Object.fromEntries(headers.map((h, i) => [h, values[i] || ""])), source));
  }

  async function parseSpreadsheet(file) {
    if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
    if (!window.XLSX) throw new Error("Excel parser is still loading. Please try the file again in a moment.");
    const data = await file.arrayBuffer();
    const workbook = window.XLSX.read(data, { type:"array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return window.XLSX.utils.sheet_to_json(sheet, { defval:"" }).map((row) => normalizeRecord(row, "Excel/CSV"));
  }

  function mainContent() {
    const main = document.querySelector("main");
    if (!main) return null;
    return [...main.children].find((child) => child.tagName !== "HEADER" && child.id !== "rea-claims-workspace");
  }

  function navButtons() {
    return [...document.querySelectorAll("nav button")];
  }

  function renameInspections() {
    navButtons().forEach((button) => {
      if (button.textContent?.trim() === "Inspections") {
        const nodes = [...button.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE);
        if (nodes.length) nodes[nodes.length - 1].textContent = " Claims";
        else button.append(document.createTextNode(" Claims"));
        button.dataset.claimsNav = "true";
      }
    });
    document.querySelectorAll("button").forEach((button) => {
      if (/Review Pending Reports/.test(button.textContent || "")) {
        button.childNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && /Review Pending Reports/.test(node.textContent || "")) node.textContent = (node.textContent || "").replace("Review Pending Reports", "Review Claims");
        });
      }
    });
  }

  function buildWorkspace() {
    if (document.getElementById("rea-claims-workspace")) return;
    const main = document.querySelector("main");
    const header = main?.querySelector(":scope > header");
    if (!main || !header) return;
    const section = document.createElement("section");
    section.id = "rea-claims-workspace";
    section.dataset.open = "false";
    section.innerHTML = `
      <div class="claims-shell">
        <div class="claims-head">
          <div>
            <div class="claims-eyebrow">Payment verification intake</div>
            <h2>Claims</h2>
            <p class="claims-subtitle">Receive contractor completion claims from REA systems or spreadsheet uploads, validate the claim data, and assign eligible claims to a consultant for independent field verification before payment processing.</p>
          </div>
          <button type="button" class="claims-btn secondary" id="claims-download-template">Download CSV Template</button>
        </div>
        <div class="claims-kpis" id="claims-kpis"></div>
        <div class="claims-intake">
          <article class="claims-card claims-intake-card">
            <div class="claims-intake-title">REA API Intake</div>
            <p class="claims-intake-copy">Provision for claims received directly from an authorised REA finance/project system. Imported records are normalized into the same verification queue as spreadsheet claims.</p>
            <button type="button" class="claims-btn" id="claims-api-sync">Sync REA API</button>
            <span id="claims-api-status" class="claims-note" style="margin-left:10px"></span>
          </article>
          <article class="claims-card claims-intake-card">
            <div class="claims-intake-title">Excel / CSV Upload</div>
            <p class="claims-intake-copy">Upload contractor payment claims containing programme, component, location, coordinates, amount and completion details.</p>
            <input class="claims-file" id="claims-file" type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" />
            <div class="claims-note">Expected fields: Claim ID, Contractor, Programme, Component, Project, State, LGA, Latitude, Longitude, Amount, Completion %.</div>
          </article>
        </div>
        <section class="claims-card">
          <div class="claims-toolbar">
            <div><h3>Claims Verification Queue</h3><p>Assign a consultant when the claim is ready for independent verification.</p></div>
            <button type="button" class="claims-btn ghost" id="claims-reset-demo">Reset sample data</button>
          </div>
          <div class="claims-table-wrap"><table><thead><tr>
            <th>Claim</th><th>Contractor / Project</th><th>Programme</th><th>Component</th><th>Location</th><th>Coordinates</th><th>Amount Claimed</th><th>Completion</th><th>Source</th><th>Status</th><th>Consultant Assignment</th>
          </tr></thead><tbody id="claims-body"></tbody></table></div>
        </section>
      </div>`;
    header.insertAdjacentElement("afterend", section);
    bindWorkspace(section);
    render();
  }

  function render() {
    const body = document.getElementById("claims-body");
    const kpis = document.getElementById("claims-kpis");
    if (!body || !kpis) return;
    const totalAmount = claims.reduce((sum, claim) => sum + Number(claim.amount || 0), 0);
    const assigned = claims.filter((claim) => claim.status === "Assigned").length;
    const needsReview = claims.filter((claim) => claim.status === "Needs review").length;
    kpis.innerHTML = [
      ["Claims received", claims.length.toLocaleString(), "Current intake queue"],
      ["Amount claimed", money(totalAmount), "Across current claims"],
      ["Assigned to consultant", assigned.toLocaleString(), "Ready for verification"],
      ["Needs review", needsReview.toLocaleString(), "Incomplete or inconsistent data"],
    ].map(([label,value,detail]) => `<article class="claims-card claims-kpi"><div class="claims-kpi-label">${label}</div><div class="claims-kpi-value">${value}</div><div class="claims-kpi-detail">${detail}</div></article>`).join("");

    body.innerHTML = claims.map((claim, index) => {
      const tone = claim.status === "Needs review" ? "attention" : claim.status === "Assigned" ? "assigned" : "";
      return `<tr>
        <td><div class="claim-id">${escapeHtml(claim.id)}</div></td>
        <td><strong style="color:#173b2a">${escapeHtml(claim.contractor)}</strong><div style="margin-top:3px;color:#64748b">${escapeHtml(claim.project)}</div></td>
        <td>${escapeHtml(claim.programme)}</td><td>${escapeHtml(claim.component)}</td>
        <td>${escapeHtml(claim.state)}<div style="margin-top:3px;color:#94a3b8">${escapeHtml(claim.lga)}</div></td>
        <td><span class="claim-coord">${Number(claim.latitude).toFixed(4)}, ${Number(claim.longitude).toFixed(4)}</span></td>
        <td><span class="claim-money">${money(claim.amount)}</span></td><td>${Number(claim.completion || 0).toLocaleString()}%</td>
        <td><span class="claim-source">${escapeHtml(claim.source)}</span></td><td><span class="claim-status ${tone}">${escapeHtml(claim.status)}</span></td>
        <td><select class="claim-consultant" data-claim-index="${index}"><option value="">Assign consultant…</option>${consultants.map((name) => `<option ${claim.consultant === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></td>
      </tr>`;
    }).join("");

    body.querySelectorAll("select.claim-consultant").forEach((select) => select.addEventListener("change", (event) => {
      const index = Number(event.target.dataset.claimIndex);
      claims[index].consultant = event.target.value;
      claims[index].status = event.target.value ? "Assigned" : "Ready for assignment";
      save(); render();
    }));
  }

  function bindWorkspace(section) {
    section.querySelector("#claims-file")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0]; if (!file) return;
      try {
        const imported = await parseSpreadsheet(file);
        if (!imported.length) throw new Error("No claim rows were found in the file.");
        claims = [...imported, ...claims]; save(); render();
        event.target.value = "";
      } catch (error) { alert(error instanceof Error ? error.message : "Could not import this file."); }
    });
    section.querySelector("#claims-api-sync")?.addEventListener("click", () => {
      const status = section.querySelector("#claims-api-status");
      if (status) status.textContent = "API provision ready · awaiting REA endpoint credentials";
    });
    section.querySelector("#claims-reset-demo")?.addEventListener("click", () => { claims = sampleClaims.map((claim) => ({...claim})); save(); render(); });
    section.querySelector("#claims-download-template")?.addEventListener("click", () => {
      const csv = "Claim ID,Contractor,Programme,Component,Project,State,LGA,Latitude,Longitude,Amount,Completion %\nCLM-2026-100,Example Energy Ltd,DARES,Mini Grid,Example Community Mini Grid,Kano,Kumbotso,11.9581,8.5224,150000000,100\n";
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"})); a.download = "rea-claims-upload-template.csv"; a.click(); URL.revokeObjectURL(a.href);
    });
  }

  function showClaims(show) {
    const workspace = document.getElementById("rea-claims-workspace");
    const content = mainContent();
    if (!workspace || !content) return;
    workspace.dataset.open = show ? "true" : "false";
    content.style.display = show ? "none" : "";
  }

  function bindNavigation() {
    navButtons().forEach((button) => {
      if (button.dataset.claimsNav === "true" && button.dataset.claimsBound !== "true") {
        button.dataset.claimsBound = "true";
        button.addEventListener("click", () => setTimeout(() => showClaims(true), 0));
      } else if (button.dataset.claimsNav !== "true" && button.dataset.claimsBound !== "true") {
        button.dataset.claimsBound = "true";
        button.addEventListener("click", () => showClaims(false));
      }
    });
    document.querySelectorAll("button").forEach((button) => {
      if (/Review Claims/.test(button.textContent || "") && button.dataset.claimsQuick !== "true") {
        button.dataset.claimsQuick = "true";
        button.addEventListener("click", () => setTimeout(() => showClaims(true), 0));
      }
    });
  }

  function loadXlsx() {
    if (window.XLSX || document.querySelector('script[data-claims-xlsx]')) return;
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.defer = true;
    script.dataset.claimsXlsx = "true";
    document.head.appendChild(script);
  }

  function apply() { renameInspections(); buildWorkspace(); bindNavigation(); loadXlsx(); }
  const observer = new MutationObserver(() => apply());
  observer.observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply, {once:true}); else apply();
})();
