const DATASETS = {
  projects: {
    from: "projects p",
    dimensions: {
      state: "p.state",
      lga: "p.lga",
      community: "p.community",
      programme: "p.programme",
      component: "p.component",
      contractor: "p.contractor",
      consultantFirm: "p.consultant_firm",
      status: "p.portfolio_status",
      reportingMonth: "p.reporting_month",
      dataSource: "p.data_source",
      verified: "p.verified",
    },
    measures: {
      projectCount: "COUNT(*)",
      installedCapacityKw: "SUM(COALESCE(p.installed_capacity_kw,0))",
      households: "SUM(COALESCE(p.households,0))",
      verifiedProjects: "SUM(CASE WHEN p.verified=1 THEN 1 ELSE 0 END)",
      pendingProjects: "SUM(CASE WHEN p.verified=1 THEN 0 ELSE 1 END)",
      averageCapacityKw: "AVG(COALESCE(p.installed_capacity_kw,0))",
      averageHouseholds: "AVG(COALESCE(p.households,0))",
    },
  },
  assignments: {
    from: "assignments a JOIN projects p ON p.id=a.project_id JOIN users u ON u.id=a.officer_id",
    dimensions: {
      state: "p.state",
      lga: "p.lga",
      community: "p.community",
      programme: "p.programme",
      component: "p.component",
      contractor: "p.contractor",
      consultantFirm: "p.consultant_firm",
      officer: "u.name",
      status: "a.status",
      dueDate: "a.due_date",
    },
    measures: {
      assignmentCount: "COUNT(*)",
      submittedAssignments: "SUM(CASE WHEN a.submitted_at IS NOT NULL THEN 1 ELSE 0 END)",
      approvedAssignments: "SUM(CASE WHEN a.approved_at IS NOT NULL THEN 1 ELSE 0 END)",
      verifiedAssignments: "SUM(CASE WHEN a.verified_at IS NOT NULL THEN 1 ELSE 0 END)",
    },
  },
  consultants: {
    from: "consultants c",
    dimensions: {
      firmName: "c.firm_name",
      status: "c.status",
      engagementStart: "c.engagement_start",
      engagementEnd: "c.engagement_end",
    },
    measures: {
      consultantCount: "COUNT(*)",
    },
  },
  users: {
    from: "users u",
    dimensions: {
      role: "u.role",
      consultantFirm: "u.consultant_firm",
      status: "u.status",
      name: "u.name",
    },
    measures: {
      userCount: "COUNT(*)",
    },
  },
};

const OPS = new Set(["eq", "neq", "in", "contains", "gt", "gte", "lt", "lte"]);
const MAX_ROWS = 200;

function cleanString(value, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function analyticsCatalog() {
  return Object.fromEntries(
    Object.entries(DATASETS).map(([name, dataset]) => [name, {
      dimensions: Object.keys(dataset.dimensions),
      measures: Object.keys(dataset.measures),
    }]),
  );
}

export function parsePlannerJson(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    return JSON.parse(cleaned.slice(first, last + 1));
  } catch {
    return null;
  }
}

export function validateAnalyticsPlan(raw) {
  if (!raw || typeof raw !== "object" || raw.mode !== "analytics") return null;
  const datasetName = cleanString(raw.dataset, 30);
  const dataset = DATASETS[datasetName];
  if (!dataset) return null;

  const dimensions = Array.isArray(raw.dimensions)
    ? [...new Set(raw.dimensions.map((v) => cleanString(v, 40)).filter((v) => dataset.dimensions[v]))].slice(0, 4)
    : [];
  const measures = Array.isArray(raw.measures)
    ? [...new Set(raw.measures.map((v) => cleanString(v, 40)).filter((v) => dataset.measures[v]))].slice(0, 6)
    : [];
  if (!measures.length) measures.push(datasetName === "assignments" ? "assignmentCount" : datasetName === "consultants" ? "consultantCount" : datasetName === "users" ? "userCount" : "projectCount");

  const filters = [];
  if (Array.isArray(raw.filters)) {
    for (const filter of raw.filters.slice(0, 8)) {
      const field = cleanString(filter?.field, 40);
      const op = cleanString(filter?.op, 20);
      if (!dataset.dimensions[field] || !OPS.has(op)) continue;
      let value = filter?.value;
      if (op === "in") {
        if (!Array.isArray(value)) continue;
        value = value.map((v) => typeof v === "number" ? v : cleanString(String(v), 120)).slice(0, 30);
        if (!value.length) continue;
      } else if (typeof value !== "number") {
        value = cleanString(String(value ?? ""), 120);
        if (!value) continue;
      }
      filters.push({ field, op, value });
    }
  }

  const validOrderFields = new Set([...dimensions, ...measures]);
  const orderBy = [];
  if (Array.isArray(raw.orderBy)) {
    for (const order of raw.orderBy.slice(0, 3)) {
      const field = cleanString(order?.field, 40);
      if (!validOrderFields.has(field)) continue;
      orderBy.push({ field, direction: String(order?.direction).toLowerCase() === "asc" ? "ASC" : "DESC" });
    }
  }

  const requestedLimit = Number(raw.limit || 100);
  const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 100, MAX_ROWS));

  return { dataset: datasetName, dimensions, measures, filters, orderBy, limit };
}

export function compileAnalyticsPlan(plan) {
  const dataset = DATASETS[plan.dataset];
  if (!dataset) throw new Error("Unsupported analytics dataset.");

  const select = [];
  const groupBy = [];
  for (const dimension of plan.dimensions) {
    const expr = dataset.dimensions[dimension];
    select.push(`${expr} AS \"${dimension}\"`);
    groupBy.push(expr);
  }
  for (const measure of plan.measures) {
    select.push(`${dataset.measures[measure]} AS \"${measure}\"`);
  }

  const where = [];
  const params = [];
  for (const filter of plan.filters) {
    const expr = dataset.dimensions[filter.field];
    if (filter.op === "eq" || filter.op === "neq" || filter.op === "gt" || filter.op === "gte" || filter.op === "lt" || filter.op === "lte") {
      const token = { eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" }[filter.op];
      where.push(`${expr} ${token} ?`);
      params.push(filter.value);
    } else if (filter.op === "contains") {
      where.push(`LOWER(COALESCE(${expr},'')) LIKE LOWER(?)`);
      params.push(`%${filter.value}%`);
    } else if (filter.op === "in") {
      where.push(`${expr} IN (${filter.value.map(() => "?").join(",")})`);
      params.push(...filter.value);
    }
  }

  let sql = `SELECT ${select.join(", ")} FROM ${dataset.from}`;
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  if (groupBy.length) sql += ` GROUP BY ${groupBy.join(", ")}`;
  if (plan.orderBy.length) {
    sql += ` ORDER BY ${plan.orderBy.map((order) => `\"${order.field}\" ${order.direction}`).join(", ")}`;
  } else if (plan.dimensions.length) {
    sql += ` ORDER BY ${plan.dimensions.map((d) => `\"${d}\" ASC`).join(", ")}`;
  }
  sql += ` LIMIT ${plan.limit}`;
  return { sql, params };
}

export async function executeAnalyticsPlan(env, plan) {
  if (!env.DB) throw new Error("D1 database binding is unavailable.");
  const { sql, params } = compileAnalyticsPlan(plan);
  const statement = env.DB.prepare(sql);
  const result = params.length ? await statement.bind(...params).all() : await statement.all();
  const rows = result.results || [];
  return {
    plan,
    rowCount: rows.length,
    rows,
    truncated: rows.length >= plan.limit,
  };
}

export function plannerPrompt(question, catalog) {
  return `You are the Veritas analytics query planner. Convert the user's data question into ONE structured read-only analytics plan.\n\nYou are NOT allowed to write SQL. Use only this catalog:\n${JSON.stringify(catalog)}\n\nReturn JSON only with this shape:\n{\"mode\":\"analytics\",\"dataset\":\"projects\",\"dimensions\":[],\"measures\":[],\"filters\":[{\"field\":\"component\",\"op\":\"eq\",\"value\":\"Mini Grid\"}],\"orderBy\":[],\"limit\":100}\n\nRules:\n- Use mode \"analytics\" only for questions answerable from the catalog. Otherwise return {\"mode\":\"general\"}.\n- Never request personal contact information, credentials, secrets, precise coordinates, signatures, evidence contents, hashes, or tokens.\n- Prefer exact aggregates rather than record listings.\n- For \"by X\" questions put X in dimensions.\n- projectCount counts projects; assignmentCount counts assignments.\n- verified is a project dimension stored as 1 or 0.\n- Use filters for named states, programmes, components, contractors, consultants, statuses, officers, or reporting periods.\n- limit must be 200 or less.\n\nUSER QUESTION:\n${question}`;
}

export function analyticsAnswerPrompt(question, result) {
  return `You are Veritas, the REA intelligence assistant. Answer the user's question using ONLY the authoritative analytics result below. Do not invent missing values or outside claims.\n\nUSER QUESTION:\n${question}\n\nANALYTICS RESULT:\n${JSON.stringify(result)}\n\nInstructions:\n- State exact totals and breakdowns clearly.\n- If many rows are returned, use a compact list rather than a wide Markdown table.\n- If result.truncated is true, say the result was limited and do not claim it is complete.\n- Keep interpretation distinct from database facts.\n- Do not mention SQL, internal implementation, provider names, or hidden system details.\n- Be concise but complete.`;
}
