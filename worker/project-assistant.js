// Deterministic project discovery and selection for Ask Veritas.
//
// This module keeps project browsing out of generic aggregate analytics. It
// returns selectable project records for natural commands such as
// "verify a project" and "list all mini-grids", and provides a concise
// project profile after the user selects an item.

const LIST_VERB = /\b(list|show|display|browse|find|view|see|give me|open)\b/i;
const PROJECT_SUBJECT = /\b(projects?|mini[\s-]*grids?|minigrids?|grid[\s-]*extensions?|standalone\s+solar(?:\s+systems?)?|sas)\b/i;
const GENERIC_VERIFY = /\b(?:verify|check|validate|inspect)\s+(?:(?:a|one|any|the|all)\s+)?(?:project|mini[\s-]*grid|minigrid|mini[\s-]*grids|minigrids|grid[\s-]*extension|grid[\s-]*extensions|standalone\s+solar|sas)\b[?.!\s]*$/i;
const WANT_TO_VERIFY = /\b(?:want|need|like)\s+to\s+(?:verify|check|validate|inspect)\s+(?:(?:a|one|any|the)\s+)?(?:project|mini[\s-]*grid|minigrid)\b/i;\nconst PROJECT_VERIFY_INTENT = /^\s*(?:please\s+)?(?:verify|check|validate|inspect)\b[\s\S]{0,100}\b(?:project|mini[\s-]*grid|minigrid|grid[\s-]*extension|standalone\s+solar|sas)\b/i;
const PROJECT_RECORD = /\b(?:show|open|view|review|give me|tell me about)\b[\s\S]{0,70}\b(?:project\s+record|project\s+details?|project\s+profile|record|details?|profile)\b|\bproject\s+(?:record|details?|profile)\b/i;

const PROJECT_COLUMNS = \`id,name,programme,component,contractor,consultant_firm AS consultantFirm,
  state,lga,community,portfolio_status AS status,installed_capacity_kw AS installedCapacityKw,
  households,verified,latitude,longitude,commissioned_at AS commissionedAt,data_source AS dataSource\`;

function clean(value) {
  return String(value || "").trim();
}

function normal(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
}

function containsPhrase(question, value) {
  const phrase = clean(value);
  if (!phrase || phrase.length < 2) return false;
  const pattern = new RegExp(\`(^|[^a-z0-9])\${escapeRegex(phrase.toLowerCase())}([^a-z0-9]|$)\`, "i");
  return pattern.test(String(question || "").toLowerCase());
}

function componentWanted(question) {
  const q = String(question || "");
  if (/\b(?:mini[\s-]*grids?|minigrids?)\b/i.test(q)) return "mini grid";
  if (/\bgrid[\s-]*extensions?\b/i.test(q)) return "grid extension";
  if (/\bstandalone\s+solar(?:\s+systems?)?\b|\bsas\b/i.test(q)) return "sas";
  return "";
}

function componentMatches(component, wanted) {
  if (!wanted) return true;
  const value = normal(component);
  if (wanted === "mini grid") return value.includes("mini grid");
  if (wanted === "grid extension") return value.includes("grid extension");
  if (wanted === "sas") return value === "sas" || value.includes("standalone solar");
  return true;
}

function longestMention(question, rows, field) {
  const values = [...new Set(rows.map((row) => clean(row[field])).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  return values.find((value) => containsPhrase(question, value)) || "";
}

export function isProjectListQuestion(question) {
  const q = String(question || "").trim();
  if (!PROJECT_SUBJECT.test(q)) return false;
  return LIST_VERB.test(q)
    || /\b(?:which|what)\b[\s\S]{0,30}\b(?:projects?|mini[\s-]*grids?|minigrids?)\b/i.test(q);
}

export function isGenericProjectVerificationRequest(question) {
  const q = String(question || "").trim();
  return GENERIC_VERIFY.test(q) || WANT_TO_VERIFY.test(q) || PROJECT_VERIFY_INTENT.test(q);
}

export function isProjectRecordQuestion(question) {
  return PROJECT_RECORD.test(String(question || ""));
}

export function shouldRunProjectAssistant(question, hints = {}) {
  if (isProjectListQuestion(question) || isGenericProjectVerificationRequest(question)) return true;
  return Boolean(clean(hints.projectId)) && isProjectRecordQuestion(question);
}

async function loadProjects(env) {
  const result = await env.DB.prepare(
    \`SELECT \${PROJECT_COLUMNS} FROM projects ORDER BY name COLLATE NOCASE LIMIT 2000\`,
  ).all();
  return result?.results || [];
}

function filteredProjects(rows, question) {
  const wantedComponent = componentWanted(question);
  const state = longestMention(question, rows, "state");
  const lga = longestMention(question, rows, "lga");
  const community = longestMention(question, rows, "community");
  const programme = longestMention(question, rows, "programme");

  return rows.filter((row) => {
    if (!componentMatches(row.component, wantedComponent)) return false;
    if (state && clean(row.state).toLowerCase() !== state.toLowerCase()) return false;
    if (lga && clean(row.lga).toLowerCase() !== lga.toLowerCase()) return false;
    if (community && clean(row.community).toLowerCase() !== community.toLowerCase()) return false;
    if (programme && clean(row.programme).toLowerCase() !== programme.toLowerCase()) return false;
    return true;
  });
}

function isDemoRecord(row) {
  const source = normal(row?.dataSource);
  const status = normal(row?.status);
  const name = normal(row?.name);
  return source.includes("demo") || source.includes("external")
    || status.includes("external demo")
    || name.includes("external demo");
}

function sortProjectRows(rows) {
  return [...rows].sort((a, b) => {
    for (const field of ["state", "lga", "community", "name"]) {
      const compared = clean(a?.[field]).localeCompare(clean(b?.[field]), "en", { sensitivity: "base", numeric: true });
      if (compared) return compared;
    }
    return 0;
  });
}

function choiceOf(row) {
  return {
    id: row.id,
    name: row.name,
    state: row.state || "",
    lga: row.lga || "",
    community: row.community || "",
    component: row.component || "",
    programme: row.programme || "",
    status: row.status || "",
    verified: Number(row.verified) === 1,
    isDemo: isDemoRecord(row),
  };
}

function projectListAnswer(matches, scope) {
  const sorted = sortProjectRows(matches);
  const demo = sorted.filter(isDemoRecord);
  const portfolio = sorted.filter((row) => !isDemoRecord(row));
  const verified = portfolio.filter((row) => Number(row.verified) === 1).length;
  const notVerified = Math.max(0, portfolio.length - verified);
  const locations = new Set(sorted.map((row) => clean(row.state)).filter(Boolean));
  const subject = scope || "matching";

  const headline = `I found **${sorted.length.toLocaleString("en-GB")} ${subject} project${sorted.length === 1 ? "" : "s"}** in the current Veritas register${locations.size ? ` across **${locations.size.toLocaleString("en-GB")} state${locations.size === 1 ? "" : "s"}/FCT**` : ""}.`;

  const summary = [];
  if (portfolio.length) {
    summary.push(`**${portfolio.length.toLocaleString("en-GB")}** portfolio record${portfolio.length === 1 ? "" : "s"}`);
    summary.push(`**${verified.toLocaleString("en-GB")} verified**`);
    summary.push(`**${notVerified.toLocaleString("en-GB")} not yet verified**`);
  }
  if (demo.length) summary.push(`**${demo.length.toLocaleString("en-GB")} external/demo reference${demo.length === 1 ? "" : "s"}**`);

  return [
    headline,
    summary.length ? `**Register summary:** ${summary.join(" · ")}.` : "",
    demo.length
      ? "External/demo records are clearly marked below and are kept separate from normal portfolio status."
      : "",
    "Browse the register below by state or use search for a project name, LGA, community or programme. Select any project to open its record and continue with verification or satellite analysis.",
  ].filter(Boolean).join("\n\n");
}

function describeScope(question, rows) {
  const component = componentWanted(question);
  const state = longestMention(question, rows, "state");
  const lga = longestMention(question, rows, "lga");
  const programme = longestMention(question, rows, "programme");
  const parts = [];
  if (component === "mini grid") parts.push("Mini Grid");
  if (component === "grid extension") parts.push("Grid Extension");
  if (component === "sas") parts.push("SAS / Standalone Solar");
  if (programme) parts.push(programme);
  if (lga) parts.push(lga);
  else if (state) parts.push(state);
  return parts.join(" · ");
}

function projectProfileAnswer(project) {
  const place = [project.community, project.lga, project.state].filter(Boolean).join(", ");
  const classification = [project.programme, project.component].filter(Boolean).join(" · ");
  const capacity = Number(project.installedCapacityKw || 0);
  const households = Number(project.households || 0);
  const verified = Number(project.verified) === 1;
  const hasCoordinates = project.latitude !== null && project.latitude !== undefined
    && project.longitude !== null && project.longitude !== undefined;
  const viirsReady = hasCoordinates && Boolean(project.commissionedAt);

  const lead = [
    \`**\${project.name}**\`,
    place ? \`is recorded in \${place}\` : "is in the Veritas project register",
    classification ? \`under \${classification}\` : "",
  ].filter(Boolean).join(" ");

  const operational = [
    project.status ? \`portfolio status **\${project.status}**\` : null,
    verified ? "**Verified** in the project register" : "**not currently marked Verified**",
    capacity > 0 ? \`\${capacity.toLocaleString("en-GB", { maximumFractionDigits: 2 })} kW installed capacity\` : null,
    households > 0 ? \`\${households.toLocaleString("en-GB")} households recorded\` : null,
  ].filter(Boolean);

  const checks = [
    hasCoordinates
      ? "A stored project location is available, so Veritas can run a satellite imagery check against the project point."
      : "No stored project location is available, so satellite verification cannot be run defensibly yet.",
    viirsReady
      ? "A commissioning/completion reference is also recorded, so the project is eligible for a VIIRS before-and-after lookup when an impact result has been processed."
      : "VIIRS before-and-after analysis still requires both a stored project location and a reliable commissioning/completion reference.",
  ];

  return [
    \`\${lead}.\`,
    operational.length ? \`Current record: \${operational.join(" · ")}.\` : "",
    ...checks,
    "You can now ask me to verify it by satellite, check its VIIRS night-light impact, or review its verification status and project record.",
  ].filter(Boolean).join("\n\n");
}

export async function runProjectAssistant(env, question, hints = {}) {
  if (!env.DB) throw new Error("D1 database binding is unavailable.");

  const selectedId = clean(hints.projectId);
  if (selectedId && isProjectRecordQuestion(question)) {
    const project = await env.DB.prepare(
      \`SELECT \${PROJECT_COLUMNS} FROM projects WHERE id=? LIMIT 1\`,
    ).bind(selectedId).first();
    if (!project) {
      return {
        kind: "profile",
        answer: "I could not find that project in the current Veritas register. Please choose another project.",
        choices: [],
        choiceMode: "project",
      };
    }
    return {
      kind: "profile",
      answer: projectProfileAnswer(project),
      project: choiceOf(project),
      choices: [],
      choiceMode: "project",
    };
  }

  const rows = await loadProjects(env);
  const matches = filteredProjects(rows, question);
  const scope = describeScope(question, rows);

  if (isGenericProjectVerificationRequest(question)) {
    const mappable = matches.filter((row) =>
      row.latitude !== null && row.latitude !== undefined
      && row.longitude !== null && row.longitude !== undefined,
    );
    if (!mappable.length) {
      return {
        kind: "verify-select",
        answer: scope
          ? \`I could not find a \${scope} project with a stored map location that is ready for satellite verification.\`
          : "I could not find a project with a stored map location that is ready for satellite verification.",
        choices: [],
        choiceMode: "satellite",
      };
    }
    return {
      kind: "verify-select",
      answer: [
        scope ? \`Which \${scope} project do you want me to verify?\` : "Which project do you want me to verify?",
        \`I found \${mappable.length.toLocaleString("en-GB")} selectable project\${mappable.length === 1 ? "" : "s"} with stored map locations. Choose one below; you can search by project name, state, LGA, community or programme.\`,
      ].join("\n\n"),
      choices: mappable.map(choiceOf),
      choiceMode: "satellite",
    };
  }

  if (isProjectListQuestion(question)) {
    if (!matches.length) {
      const sortedMatches = sortProjectRows(matches);
    return {
      kind: "list",
      answer: projectListAnswer(sortedMatches, scope),
      choices: sortedMatches.map(choiceOf),
      choiceMode: "project",
    };    }

    return {
      kind: "list",
      answer: [
        scope
          ? \`I found \${matches.length.toLocaleString("en-GB")} \${scope} project\${matches.length === 1 ? "" : "s"} in the current Veritas register.\`
          : \`I found \${matches.length.toLocaleString("en-GB")} matching project\${matches.length === 1 ? "" : "s"} in the current Veritas register.\`,
        "Select any project below to open its record. Use the search box to narrow the list by project name, state, LGA, community or programme.",
      ].join("\n\n"),
      choices: matches.map(choiceOf),
      choiceMode: "project",
    };
  }

  return null;
}
