import fs from "node:fs";

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`${label} anchor not found`);
  return source.replace(search, replacement);
}

const dashboardDataPath = "client/lib/dashboard-data.ts";
let dashboardData = fs.readFileSync(dashboardDataPath, "utf8");
dashboardData = replaceOnce(
  dashboardData,
  `export type Project = {\n  name: string;`,
  `export type Project = {\n  id?: string;\n  name: string;`,
  "project id metadata",
);
dashboardData = replaceOnce(
  dashboardData,
  `  state: string;\n  programme: string;`,
  `  state: string;\n  lga?: string;\n  community?: string;\n  programme: string;`,
  "project location metadata",
);
fs.writeFileSync(dashboardDataPath, dashboardData);

const mapDataPath = "client/lib/rea-project-map-data.ts";
let mapData = fs.readFileSync(mapDataPath, "utf8");
mapData = replaceOnce(
  mapData,
  `  return {\n    name: record.name,\n    state: record.state,`,
  `  return {\n    id: record.id,\n    name: record.name,\n    state: record.state,\n    lga: record.lga,\n    community: record.community,`,
  "map project metadata conversion",
);
fs.writeFileSync(mapDataPath, mapData);

const enhancerPath = "client/components/ConsultantCoverageMapEnhancer.tsx";
let enhancer = fs.readFileSync(enhancerPath, "utf8");
enhancer = replaceOnce(
  enhancer,
  `function statusColor(assignment: InspectionAssignment) {\n  const status = getAssignmentDisplayStatus(assignment.status);`,
  `function assignmentStatusLabel(item: InspectionAssignment) {\n  return (item as InspectionAssignment & { mapDisplayStatus?: string }).mapDisplayStatus ?? getAssignmentDisplayStatus(item.status);\n}\nfunction statusColor(assignment: InspectionAssignment) {\n  const status = getAssignmentDisplayStatus(assignment.status);`,
  "map display status helper",
);
enhancer = replaceOnce(
  enhancer,
  `  const { visibleAssignments: assignments } = useConsultantPortfolio();`,
  `  const { visibleAssignments: assignments, unallocatedProjects } = useConsultantPortfolio();\n  const mapAssignments = useMemo<Array<InspectionAssignment & { mapDisplayStatus?: string }>>(() => {\n    const allocated = unallocatedProjects\n      .filter((project) => Number.isFinite(project.latitude) && Number.isFinite(project.longitude))\n      .map((project) => ({\n        id: project.id || \`allocated-\${project.name}\`,\n        projectName: project.name,\n        programme: project.programme,\n        component: project.component,\n        contractor: project.contractor,\n        consultantFirm: \"\",\n        state: project.state,\n        lga: project.lga || \"\",\n        community: project.community || \"\",\n        latitude: Number(project.latitude),\n        longitude: Number(project.longitude),\n        geofenceRadiusMetres: 250,\n        officer: \"Awaiting field officer\",\n        dueDate: \"\",\n        status: \"Assigned\" as const,\n        mapDisplayStatus: \"Awaiting field officer\",\n        audit: [],\n      }));\n    return [...allocated, ...assignments];\n  }, [assignments, unallocatedProjects]);`,
  "coverage map portfolio source",
);
enhancer = replaceOnce(
  enhancer,
  `{getAssignmentDisplayStatus(item.status)}`,
  `{assignmentStatusLabel(item)}`,
  "project list status label",
);
enhancer = replaceOnce(
  enhancer,
  `  return createPortal(<ConsultantCoverageMap assignments={assignments} />, target);`,
  `  return createPortal(<ConsultantCoverageMap assignments={mapAssignments} />, target);`,
  "coverage map portal source",
);
fs.writeFileSync(enhancerPath, enhancer);

console.log("Consultant coverage map now includes REA-allocated project coordinates without mislabelling them as field assignments.");
