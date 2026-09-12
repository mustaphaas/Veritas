import fs from "node:fs";

const path = "worker/index.js";
let source = fs.readFileSync(path, "utf8");

const endpointAnchor = "async function reaProjectsResponse(request, env) {";
const endpoint = `async function reaUsersResponse(request, env) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (!String(user.role || "").startsWith("rea_")) return json({ error: "REA access required." }, 403);

  const result = await env.DB.prepare(\`SELECT id,name,email,phone,role,consultant_firm AS consultantFirm,status,created_at AS createdAt
    FROM users ORDER BY role,name\`).all();
  const users = (result.results || []).map((record) => ({
    id: record.id,
    name: record.name,
    email: record.email || "",
    phone: record.phone || "",
    role: record.role,
    classification: String(record.role || "").startsWith("rea_")
      ? "REA Staff"
      : record.role === "consultant_admin"
        ? "Consultant Admin"
        : record.role === "field_officer"
          ? "Field Officer"
          : "Other",
    consultantFirm: record.consultantFirm || "",
    status: String(record.status || "").toLowerCase() === "active" ? "Active" : "Suspended",
    createdAt: record.createdAt,
  }));

  return json({
    users,
    summary: {
      totalPortalUsers: users.length,
      reaStaff: users.filter((record) => record.classification === "REA Staff").length,
      consultantAdmins: users.filter((record) => record.classification === "Consultant Admin").length,
      fieldOfficers: users.filter((record) => record.classification === "Field Officer").length,
      active: users.filter((record) => record.status === "Active").length,
      suspended: users.filter((record) => record.status === "Suspended").length,
    },
    serverTime: new Date().toISOString(),
  });
}

`;

if (!source.includes("async function reaUsersResponse")) {
  if (!source.includes(endpointAnchor)) throw new Error("REA users endpoint anchor not found");
  source = source.replace(endpointAnchor, endpoint + endpointAnchor);
}

const routeAnchor = `    if (url.pathname === "/api/rea/consultants") {`;
const route = `    if (url.pathname === "/api/rea/users") {
      if (request.method !== "GET") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      return reaUsersResponse(request, env);
    }

`;
if (!source.includes('url.pathname === "/api/rea/users"')) {
  if (!source.includes(routeAnchor)) throw new Error("REA users route anchor not found");
  source = source.replace(routeAnchor, route + routeAnchor);
}

source = source.replace(
  '  const reaAdmins = users.filter((user) => user.role === "rea_admin");',
  '  const reaStaff = users.filter((user) => String(user.role || "").startsWith("rea_"));',
);
source = source.replace(
  '      reaAdminCount: Array.isArray(context.users.reaAdmins) ? context.users.reaAdmins.length : 0,',
  '      reaStaffCount: Array.isArray(context.users.reaStaff) ? context.users.reaStaff.length : 0,',
);
source = source.replace(
  '      reaAdmins: reaAdmins.map(({ id, name, status, createdAt }) => ({ id, name, status, createdAt })),',
  '      reaStaff: reaStaff.map(({ id, name, role, status, createdAt }) => ({ id, name, role, status, createdAt })),',
);
source = source.replace(
  '/\\b(users?|field officers?|consultant admins?|rea admins?)\\b/i.test(q)',
  '/\\b(users?|portal users?|field officers?|consultant admins?|rea staff|rea admins?)\\b/i.test(q)',
);

fs.writeFileSync(path, source);
console.log("Patched database-backed REA users and user classifications.");
