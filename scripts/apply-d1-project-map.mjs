import fs from "node:fs";

function patch(path, replacements) {
  let text = fs.readFileSync(path, "utf8");
  for (const [from, to] of replacements) {
    if (!text.includes(from)) throw new Error(`Patch anchor not found in ${path}: ${from.slice(0, 80)}`);
    text = text.replace(from, to);
  }
  fs.writeFileSync(path, text);
}

patch("worker/index.js", [[
`function latestQuestion(messages = []) {`,
`async function reaProjectsResponse(request, env) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (user.role !== "rea_admin") return json({ error: "REA access required." }, 403);
  const result = await env.DB.prepare(\`SELECT id,name,programme,component,contractor,consultant_firm AS consultantFirm,state,lga,community,
    reporting_month AS reportingMonth,portfolio_status AS status,installed_capacity_kw AS installedCapacityKw,
    households,verified,latitude,longitude,geofence_radius_metres AS geofenceRadiusMetres,
    data_source AS dataSource,updated_at AS updatedAt
    FROM projects ORDER BY state,name\`).all();
  return json({
    projects: (result.results || []).map((project) => ({
      ...project,
      installedCapacityKw: Number(project.installedCapacityKw || 0),
      households: Number(project.households || 0),
      verified: Number(project.verified) === 1,
      latitude: Number(project.latitude),
      longitude: Number(project.longitude),
      geofenceRadiusMetres: Number(project.geofenceRadiusMetres || 250),
    })),
    serverTime: new Date().toISOString(),
  });
}

function latestQuestion(messages = []) {`
], [
`    if (url.pathname === "/api/consultant/field-officers") {`,
`    if (url.pathname === "/api/rea/projects") {
      if (request.method !== "GET") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      try {
        return await reaProjectsResponse(request, env);
      } catch (error) {
        console.error(JSON.stringify({ event: "rea_projects_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
        return json({ error: "Unable to load REA projects." }, 503);
      }
    }

    if (url.pathname === "/api/consultant/field-officers") {`
]]);

patch("client/components/ReaProjectMap.tsx", [[
`import { projects, type Project } from "../lib/dashboard-data";`,
`import type { Project } from "../lib/dashboard-data";
import { useAuth } from "../lib/auth";
import { fetchReaMapProjects, resolveProjectCoordinate, type ReaMapProjectRecord } from "../lib/rea-project-map-data";`
], [
`function enrichProjects(lgaFeatures: GeoFeature[]): MapProject[] {`,
`function enrichProjects(lgaFeatures: GeoFeature[], projects: Project[]): MapProject[] {`
], [
`    const lgaFeature = available.length ? available[seed % available.length] : undefined;
    const lga = lgaFeature ? lgaName(lgaFeature) : \`${"${project.state}"} LGA\`;`,
`    const storedLga = (project as Project & { lga?: string }).lga;
    const lgaFeature = storedLga ? available.find((feature) => lgaName(feature) === storedLga) : undefined;
    const lga = storedLga || (lgaFeature ? lgaName(lgaFeature) : \`${"${project.state}"} LGA\`);`
], [
`      id: \`REA-${"${project.programme}"}-${"${project.state.slice(0, 3).toUpperCase()}"}-${"${String(index + 1).padStart(4, \"0\")}"}\`,
      lga,
      community: \`${"${lga.replace(/[^a-zA-Z ]/g, \"\").split(\" \")[0] || project.state}"} Community ${"${(seed % 4) + 1}"}\`,`,
`      id: (project as Project & { id?: string }).id || \`REA-${"${project.programme}"}-${"${project.state.slice(0, 3).toUpperCase()}"}-${"${String(index + 1).padStart(4, \"0\")}"}\`,
      lga,
      community: (project as Project & { community?: string }).community || \`${"${lga.replace(/[^a-zA-Z ]/g, \"\").split(\" \")[0] || project.state}"} Community ${"${(seed % 4) + 1}"}\`,`
], [
`      consultant: consultants[(seed >>> 5) % consultants.length],`,
`      consultant: (project as Project & { consultant?: string }).consultant || consultants[(seed >>> 5) % consultants.length],`
], [
`function ProjectMap({ onClose, onOpenSection }: { onClose: () => void; onOpenSection: (section: string) => void }) {
  const [stateFeatures, setStateFeatures] = useState<GeoFeature[]>([]);`,
`function ProjectMap({ onClose, onOpenSection }: { onClose: () => void; onOpenSection: (section: string) => void }) {
  const { session } = useAuth();
  const [portfolioProjects, setPortfolioProjects] = useState<Project[]>([]);
  const [projectLoadError, setProjectLoadError] = useState(false);
  const [stateFeatures, setStateFeatures] = useState<GeoFeature[]>([]);`
], [
`  useEffect(() => {
    fetch("/nigeria-adm1.geojson")`,
`  useEffect(() => {
    if (!session?.apiToken) return;
    fetchReaMapProjects(session.apiToken)
      .then((records) => {
        setPortfolioProjects(records.map((record: ReaMapProjectRecord) => ({
          name: record.name,
          state: record.state,
          programme: record.programme,
          component: record.component,
          contractor: record.contractor,
          month: record.reportingMonth || record.updatedAt || new Date().toISOString(),
          status: record.status,
          tone: record.verified ? "green" : "amber",
          kw: Number(record.installedCapacityKw || 0),
          households: Number(record.households || 0),
          verified: Boolean(record.verified),
          x: 0,
          y: 0,
          latitude: record.latitude ?? undefined,
          longitude: record.longitude ?? undefined,
          id: record.id,
          lga: record.lga,
          community: record.community,
          consultant: record.consultantFirm,
        }) as Project));
        setProjectLoadError(false);
      })
      .catch(() => { setPortfolioProjects([]); setProjectLoadError(true); });
  }, [session?.apiToken]);

  useEffect(() => {
    fetch("/nigeria-adm1.geojson")`
], [
`  const mappedProjects = useMemo(() => enrichProjects(lgaFeatures), [lgaFeatures]);`,
`  const mappedProjects = useMemo(() => enrichProjects(lgaFeatures, portfolioProjects), [lgaFeatures, portfolioProjects]);`
], [
`  // National-level scatter: one point per project, placed inside its state's footprint.
  const nationalPoints = useMemo(() => {
    const map = new Map<string, Point>();
    filteredProjects.forEach((project) => {
      const feature = stateFeatureByName.get(project.state);
      if (!feature) return;
      map.set(project.id, jitterWithin(feature, hashText(project.id), stateProjector, 0.58));
    });
    return map;
  }, [filteredProjects, stateFeatureByName, stateProjector]);`,
`  // Project pins use the exact coordinates stored in D1. No synthetic fallback is allowed.
  const nationalPoints = useMemo(() => {
    const map = new Map<string, Point>();
    filteredProjects.forEach((project) => {
      const coordinate = resolveProjectCoordinate(project);
      if (coordinate) map.set(project.id, stateProjector(coordinate));
    });
    return map;
  }, [filteredProjects, stateProjector]);`
], [
`  // State-overview scatter: one point per project, placed inside its LGA's footprint.
  const overviewPoints = useMemo(() => {
    const map = new Map<string, Point>();
    stateProjects.forEach((project) => {
      const feature = lgaFeatureByName.get(project.lga);
      if (!feature) return;
      map.set(project.id, jitterWithin(feature, hashText(project.id), lgaProjector, 0.62));
    });
    return map;
  }, [stateProjects, lgaFeatureByName, lgaProjector]);`,
`  const overviewPoints = useMemo(() => {
    const map = new Map<string, Point>();
    stateProjects.forEach((project) => {
      const coordinate = resolveProjectCoordinate(project);
      if (coordinate) map.set(project.id, lgaProjector(coordinate));
    });
    return map;
  }, [stateProjects, lgaProjector]);`
], [
`  // LGA-detail pins: fuller spread once we're looking at a single LGA.
  const pinPositions = useMemo(() => {
    if (!selectedLgaFeature) return new Map<string, Point>();
    const positions = new Map<string, Point>();
    lgaProjects.forEach((project, index) => {
      const seed = hashText(project.id);
      positions.set(project.id, jitterWithin(selectedLgaFeature, seed, lgaProjector, 0.74, (index % 3) * 3.2));
    });
    return positions;
  }, [lgaProjector, lgaProjects, selectedLgaFeature]);`,
`  const pinPositions = useMemo(() => {
    const positions = new Map<string, Point>();
    lgaProjects.forEach((project) => {
      const coordinate = resolveProjectCoordinate(project);
      if (coordinate) positions.set(project.id, lgaProjector(coordinate));
    });
    return positions;
  }, [lgaProjector, lgaProjects]);`
], [
`  const activeCount = filteredProjects.filter((p) => p.mapStatus === "Active").length;`,
`  const activeCount = filteredProjects.filter((p) => p.mapStatus === "Active").length;
  const missingGpsCount = filteredProjects.filter((p) => !resolveProjectCoordinate(p)).length;`
], [
`      <style>{MAP_STYLES}</style>`,
`      <style>{MAP_STYLES}</style>
      {(projectLoadError || missingGpsCount > 0) && (
        <div className="absolute right-4 top-3 z-40 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-800 shadow-sm">
          {projectLoadError ? "Unable to load live D1 project locations." : `${"${missingGpsCount}"} project${"${missingGpsCount === 1 ? \"\" : \"s\"}"} missing valid GPS coordinates; no pin has been fabricated.`}
        </div>
      )}`
]]);

console.log("Applied D1-backed REA Project Map integration.");
