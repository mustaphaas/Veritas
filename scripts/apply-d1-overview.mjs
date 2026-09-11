import fs from "node:fs";

const path = "client/pages/Index.tsx";
let s = fs.readFileSync(path, "utf8");

const importAnchor = 'import { useAuth } from "../lib/auth";';
if (!s.includes('from "../lib/rea-project-map-data"')) {
  if (!s.includes(importAnchor)) throw new Error("auth import anchor missing");
  s = s.replace(importAnchor, `${importAnchor}\nimport { fetchReaMapProjects, reaRecordToDashboardProject } from "../lib/rea-project-map-data";`);
}

const boundaryAnchor = '  const [boundaries, setBoundaries] = useState<BoundaryFeature[]>([]);';
if (!s.includes('const [portfolioProjects, setPortfolioProjects]')) {
  if (!s.includes(boundaryAnchor)) throw new Error("boundary state anchor missing");
  s = s.replace(boundaryAnchor, `  const [portfolioProjects, setPortfolioProjects] = useState<Project[]>([]);\n  const [portfolioLoadError, setPortfolioLoadError] = useState("");\n  useEffect(() => {\n    if (!session?.apiToken) return;\n    let cancelled = false;\n    setPortfolioLoadError("");\n    fetchReaMapProjects(session.apiToken)\n      .then((records) => { if (!cancelled) setPortfolioProjects(records.map(reaRecordToDashboardProject)); })\n      .catch(() => { if (!cancelled) { setPortfolioProjects([]); setPortfolioLoadError("Unable to load the live D1 portfolio."); } });\n    return () => { cancelled = true; };\n  }, [session?.apiToken]);\n${boundaryAnchor}`);
}

const visibleAnchor = '  const visibleProjects = useMemo(() => matchingProjects(filters), [filters]);';
if (s.includes(visibleAnchor)) {
  s = s.replace(visibleAnchor, '  const visibleProjects = useMemo(() => matchingProjects(filters, undefined, portfolioProjects), [filters, portfolioProjects]);');
} else if (!s.includes('matchingProjects(filters, undefined, portfolioProjects)')) {
  throw new Error("visible projects anchor missing");
}

s = s.replace('getFilterOptions(next, filterKey).includes(next[filterKey])', 'getFilterOptions(next, filterKey, portfolioProjects).includes(next[filterKey])');
s = s.replace('options={getFilterOptions(filters, key)}', 'options={getFilterOptions(filters, key, portfolioProjects)}');
s = s.replace('<ReaAnalyticsDashboard projects={projects} />', '<ReaAnalyticsDashboard projects={portfolioProjects} />');
s = s.replace('<ReaReportsManagement projects={projects} />', '<ReaReportsManagement projects={portfolioProjects} />');

const filtersSection = '          <section className="rounded-b-xl border border-t-0 border-[#d6e9da] bg-[#f7fcf8] p-4">';
if (!s.includes('portfolioLoadError &&')) {
  if (!s.includes(filtersSection)) throw new Error("filters section anchor missing");
  s = s.replace(filtersSection, `          {portfolioLoadError && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">{portfolioLoadError}</div>}\n${filtersSection}`);
}

fs.writeFileSync(path, s);
console.log("Applied D1 portfolio synchronization to REA Overview, Analytics and Reports");
