import fs from "node:fs";

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`${label} anchor not found`);
  return source.replace(search, replacement);
}

const reaPath = "client/components/ReaVerificationManagement.tsx";
let rea = fs.readFileSync(reaPath, "utf8");
rea = replaceOnce(
  rea,
  "function openReport(assignment: InspectionAssignment, print = false) {",
  "export function openReaVerificationReport(assignment: InspectionAssignment, print = false) {",
  "REA report viewer export",
);
rea = rea.replaceAll("openReport(item,true)", "openReaVerificationReport(item,true)");
rea = rea.replaceAll("openReport(item)", "openReaVerificationReport(item)");
fs.writeFileSync(reaPath, rea);

const consultantPath = "client/pages/ConsultantAdminDashboard.tsx";
let consultant = fs.readFileSync(consultantPath, "utf8");
consultant = replaceOnce(
  consultant,
  'import RoleDashboardShell from "../components/RoleDashboardShell";',
  'import RoleDashboardShell from "../components/RoleDashboardShell";\nimport { openReaVerificationReport } from "../components/ReaVerificationManagement";',
  "consultant shared report import",
);
consultant = replaceOnce(
  consultant,
  "          onReview={setReviewing}",
  `          onReview={(item) => {\n            if (item.status === "Verified") {\n              openReaVerificationReport(item);\n              return;\n            }\n            if (item.status === "Submitted") {\n              setReviewing(item);\n              return;\n            }\n            setReviewing(item);\n          }}`,
  "verified consultant report routing",
);
fs.writeFileSync(consultantPath, consultant);

console.log("Verified consultant records now open the shared REA verification report view.");
