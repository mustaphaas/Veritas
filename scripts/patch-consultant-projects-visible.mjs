import fs from "node:fs";

const dashboardPath = "client/pages/ConsultantAdminDashboard.tsx";
let dashboard = fs.readFileSync(dashboardPath, "utf8");

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`${label} anchor not found`);
  return source.replace(search, replacement);
}

dashboard = replaceOnce(
  dashboard,
  `function ConsultantWorkspace({\n  view,\n  assignments,\n  fieldOfficers,\n  onAssign,`,
  `function ConsultantWorkspace({\n  view,\n  assignments,\n  fieldOfficers,\n  unallocatedProjects,\n  onAssign,`,
  "workspace project prop",
);

dashboard = replaceOnce(
  dashboard,
  `  assignments: InspectionAssignment[];\n  fieldOfficers: FieldOfficerAccount[];\n  onAssign: () => void;`,
  `  assignments: InspectionAssignment[];\n  fieldOfficers: FieldOfficerAccount[];\n  unallocatedProjects: Project[];\n  onAssign: () => void;`,
  "workspace project prop type",
);

const projectRowsAnchor = `      <div className="divide-y divide-slate-100">\n        {rows.map((item) => (`;
const projectRowsReplacement = `      <div className="divide-y divide-slate-100">\n        {view === "Projects" && unallocatedProjects.map((project) => (\n          <div\n            key={\`rea-project-\${project.name}\`}\n            className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"\n          >\n            <div>\n              <p className="text-xs font-bold text-[#173b2a]">{project.name}</p>\n              <p className="mt-1 text-[10px] text-slate-500">\n                {project.programme} · {project.contractor} · {project.community}, {project.state}\n              </p>\n            </div>\n            <div className="flex items-center gap-3">\n              <span className="rounded-full border border-[#f0d88d] bg-[#fff8e5] px-2.5 py-1 text-[10px] font-bold text-[#956300]">\n                Awaiting field officer\n              </span>\n              <button\n                onClick={onAssign}\n                className="rounded-md border border-[#8bcba0] px-3 py-2 text-[10px] font-bold text-[#08733f]"\n              >\n                Assign field officer\n              </button>\n            </div>\n          </div>\n        ))}\n        {rows.map((item) => (`;
dashboard = replaceOnce(dashboard, projectRowsAnchor, projectRowsReplacement, "unallocated project rows");

dashboard = replaceOnce(
  dashboard,
  `        {!rows.length && (`,
  `        {!rows.length && !(view === "Projects" && unallocatedProjects.length) && (`,
  "project empty state",
);

dashboard = replaceOnce(
  dashboard,
  `          assignments={filtered}\n          fieldOfficers={fieldOfficers}\n          onAssign={() => setAssignOpen(true)}`,
  `          assignments={filtered}\n          fieldOfficers={fieldOfficers}\n          unallocatedProjects={unallocatedProjects}\n          onAssign={() => setAssignOpen(true)}`,
  "workspace project prop wiring",
);

dashboard = replaceOnce(
  dashboard,
  `  const approved = filtered.filter((item) =>`,
  `  const portfolioProjectCount = filtered.length + unallocatedProjects.length;\n  const approved = filtered.filter((item) =>`,
  "portfolio project count",
);

dashboard = replaceOnce(
  dashboard,
  `            label="Assigned Projects"\n            value={filtered.length}`,
  `            label="Assigned Projects"\n            value={portfolioProjectCount}`,
  "assigned project KPI",
);

fs.writeFileSync(dashboardPath, dashboard);
console.log("Consultant REA-allocated project visibility patch applied.");
