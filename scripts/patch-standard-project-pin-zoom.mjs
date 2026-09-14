import fs from "node:fs";

const file = "client/components/ReaProjectMapProgramme.tsx";
let source = fs.readFileSync(file, "utf8");

const from = `                            setSelectedProject(project);\n                          }}`;
const to = `                            setSelectedProject(project);\n                            setZoom(1.85);\n                          }}`;

if (!source.includes(from)) {
  if (source.includes(to)) {
    console.log("Standard Project Map pin zoom already applied.");
    process.exit(0);
  }
  throw new Error("Unable to apply standard Project Map pin zoom: click anchor not found");
}

source = source.replace(from, to);
fs.writeFileSync(file, source);
console.log("Applied visible zoom when a standard Project Map project pin is selected.");
