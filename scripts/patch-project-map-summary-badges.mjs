import fs from "node:fs";

const file = "client/components/ReaProjectMapProgramme.tsx";
let source = fs.readFileSync(file, "utf8");

const badgeBlock = `          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-slate-200 bg-[#fafcfb] px-2.5 py-1.5 text-[9px] font-extrabold text-slate-600">
              {displayMetrics.projects.toLocaleString()} Projects
            </span>
            <span className="rounded-md border border-slate-200 bg-[#fafcfb] px-2.5 py-1.5 text-[9px] font-extrabold text-slate-600">
              {displayMetrics.verified.toLocaleString()} Verified
            </span>
            <span className="rounded-md border border-slate-200 bg-[#fafcfb] px-2.5 py-1.5 text-[9px] font-extrabold text-slate-600">
              {formatMw(displayMetrics.kw)}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[9px] font-extrabold text-slate-600">
              {displayMetrics.households.toLocaleString()} Households
            </span>
          </div>`;

if (source.includes(badgeBlock)) {
  source = source.replace(badgeBlock, "");
} else {
  const patterns = [
    /\s*<span className="rounded-md border border-slate-200 bg-\[#fafcfb\] px-2\.5 py-1\.5 text-\[9px\] font-extrabold text-slate-600">\s*\{displayMetrics\.projects\.toLocaleString\(\)\} Projects\s*<\/span>/,
    /\s*<span className="rounded-md border border-slate-200 bg-\[#fafcfb\] px-2\.5 py-1\.5 text-\[9px\] font-extrabold text-slate-600">\s*\{displayMetrics\.verified\.toLocaleString\(\)\} Verified\s*<\/span>/,
    /\s*<span className="rounded-md border border-slate-200 bg-\[#fafcfb\] px-2\.5 py-1\.5 text-\[9px\] font-extrabold text-slate-600">\s*\{formatMw\(displayMetrics\.kw\)\}\s*<\/span>/,
    /\s*<span className="rounded-md border border-slate-200 bg-slate-50 px-2\.5 py-1\.5 text-\[9px\] font-extrabold text-slate-600">\s*\{displayMetrics\.households\.toLocaleString\(\)\} Households\s*<\/span>/,
  ];
  for (const pattern of patterns) source = source.replace(pattern, "");
}

fs.writeFileSync(file, source);
console.log("Removed Project Map summary badges.");
