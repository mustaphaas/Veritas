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
  `  const [mapAssignment, setMapAssignment] =\n    useState<InspectionAssignment | null>(assignments[0] ?? null);`,
  `  const [selectedMapProjectId, setSelectedMapProjectId] = useState<string>("");`,
  "map selection state",
);

dashboard = replaceOnce(
  dashboard,
  `    setProgrammeFilter("All Programmes"); setStateFilter("All States"); setOfficerFilter("All Field Officers");\n    setMapAssignment(null); setReviewing(null); setAssignOpen(false); setCreateOfficerOpen(false);`,
  `    setProgrammeFilter("All Programmes"); setStateFilter("All States"); setOfficerFilter("All Field Officers");\n    setSelectedMapProjectId(""); setReviewing(null); setAssignOpen(false); setCreateOfficerOpen(false);`,
  "map reset",
);

dashboard = replaceOnce(
  dashboard,
  `  const mapTarget =\n    (mapAssignment &&\n      assignments.find((item) => item.id === mapAssignment.id)) ||\n    filtered[0];`,
  `  const mapPortfolio = useMemo(() => {\n    const assigned = filtered.map((item) => ({\n      id: item.id,\n      projectName: item.projectName,\n      community: item.community,\n      state: item.state,\n      latitude: item.latitude,\n      longitude: item.longitude,\n      status: getAssignmentDisplayStatus(item.status),\n    }));\n    const allocated = unallocatedProjects.map((project) => ({\n      id: project.id || project.name,\n      projectName: project.name,\n      community: project.community,\n      state: project.state,\n      latitude: project.latitude,\n      longitude: project.longitude,\n      status: "Awaiting field officer",\n    }));\n    return [...allocated, ...assigned].filter(\n      (item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude),\n    );\n  }, [filtered, unallocatedProjects]);\n  const mapTarget =\n    mapPortfolio.find((item) => item.id === selectedMapProjectId) ||\n    mapPortfolio[0];`,
  "map portfolio source",
);

dashboard = replaceOnce(
  dashboard,
  `          onMap={(assignment) => {\n            setMapAssignment(assignment);\n            navigate("/consultant-admin");\n          }}`,
  `          onMap={(assignment) => {\n            setSelectedMapProjectId(assignment.id);\n            navigate("/consultant-admin");\n          }}`,
  "map navigation selection",
);

dashboard = replaceOnce(
  dashboard,
  `              {mapTarget && <StatusPill status={mapTarget.status} />}`,
  `              {mapTarget && (\n                <span className="rounded-full border border-[#d6e9da] bg-[#f3faf5] px-2.5 py-1 text-[9px] font-bold text-[#08733f]">\n                  {mapTarget.status}\n                </span>\n              )}`,
  "map target status",
);

dashboard = replaceOnce(
  dashboard,
  `                    Filtered assignments\n                  </p>\n                  {filtered.slice(0, 12).map((item) => (\n                    <button\n                      key={item.id}\n                      onClick={() => setMapAssignment(item)}`,
  `                    Consultant project portfolio\n                  </p>\n                  {mapPortfolio.slice(0, 12).map((item) => (\n                    <button\n                      key={item.id}\n                      onClick={() => setSelectedMapProjectId(item.id)}`,
  "map project selector",
);

dashboard = replaceOnce(
  dashboard,
  `                No assigned projects match these filters.`,
  `                No consultant projects with coordinates match these filters.`,
  "map empty state",
);

fs.writeFileSync(dashboardPath, dashboard);
console.log("Consultant map now uses the full allocated project portfolio coordinates.");
