import fs from "node:fs";

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`${label} anchor not found`);
  return source.replace(search, replacement);
}

// ---------------------------------------------------------------------------
// Worker: add a consultant-scoped /api/consultant/projects endpoint.
//
// Field officers and assignments were already correctly isolated server-side
// (worker/field-api.js scopes assignments by officer_id / consultant_firm).
// Projects had no consultant-scoped endpoint at all, so the consultant
// dashboard fell back to a client-side mock project list filtered by a
// localStorage "ownership" map -- editable in devtools and not authoritative.
// This adds the missing server-side scope.
// ---------------------------------------------------------------------------
const workerPath = "worker/index.js";
let worker = fs.readFileSync(workerPath, "utf8");

if (!worker.includes("async function consultantProjectsResponse")) {
  worker = replaceOnce(
    worker,
    "async function consultantProfileResponse(request, env) {",
    `async function consultantProjectsResponse(request, env) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (user.role !== "consultant_admin" && user.role !== "rea_admin") {
    return json({ error: "Consultant or REA access required." }, 403);
  }

  let consultantFirm = user.consultantFirm;
  if (user.role === "rea_admin") {
    consultantFirm = new URL(request.url).searchParams.get("consultantFirm") || consultantFirm;
  }
  if (!consultantFirm) return json({ error: "Consultant firm is required." }, 400);

  const result = await env.DB.prepare(\`SELECT id,name,programme,component,contractor,consultant_firm AS consultantFirm,state,lga,community,
    reporting_month AS reportingMonth,portfolio_status AS status,installed_capacity_kw AS installedCapacityKw,
    households,verified,latitude,longitude,geofence_radius_metres AS geofenceRadiusMetres,
    data_source AS dataSource,updated_at AS updatedAt
    FROM projects WHERE consultant_firm=? ORDER BY state,name\`)
    .bind(consultantFirm)
    .all();

  return json({
    consultantFirm,
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

async function consultantProfileResponse(request, env) {`,
    "consultant projects endpoint",
  );
}

worker = replaceOnce(
  worker,
  `    if (url.pathname === "/api/consultant/profile") {`,
  `    if (url.pathname === "/api/consultant/projects") {
      if (request.method !== "GET") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      try {
        return await consultantProjectsResponse(request, env);
      } catch (error) {
        console.error(JSON.stringify({ event: "consultant_projects_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
        return json({ error: "Unable to load the consultant project portfolio." }, 503);
      }
    }

    if (url.pathname === "/api/consultant/profile") {`,
  "consultant projects route",
);
fs.writeFileSync(workerPath, worker);

// ---------------------------------------------------------------------------
// Client: fetch helper for the new endpoint.
// ---------------------------------------------------------------------------
const apiPath = "client/lib/field-api.ts";
let api = fs.readFileSync(apiPath, "utf8");
api = replaceOnce(
  api,
  'export const fetchConsultantFieldOfficers = () => consultantCall("/field-officers");',
  'export const fetchConsultantFieldOfficers = () => consultantCall("/field-officers");\nexport const fetchConsultantProjects = () => consultantCall("/projects");',
  "consultant projects fetch helper",
);
fs.writeFileSync(apiPath, api);

// ---------------------------------------------------------------------------
// Client: wire the consultant portfolio hook to the isolated server data for
// assignments and projects instead of the local mock dataset + localStorage
// ownership map. The mock/local path is kept only as a fallback for when the
// live API hasn't resolved yet (offline demo mode), matching the existing
// pattern already used for field officers.
// ---------------------------------------------------------------------------
const portfolioPath = "client/lib/use-consultant-portfolio.ts";
let portfolio = fs.readFileSync(portfolioPath, "utf8");

portfolio = replaceOnce(
  portfolio,
  `import { readConsultants, type ConsultantRecord } from "./consultants";
import { readConsultantOwnership, selectConsultantScope, subscribeConsultantOwnership } from "./consultant-tenancy";
import { fetchConsultantFieldOfficers } from "./field-api";
import { useInspectionWorkflow, type FieldOfficerAccount } from "./inspection-workflow";`,
  `import { readConsultants, type ConsultantRecord } from "./consultants";
import { readConsultantOwnership, isConsultantVisibleAssignment, selectConsultantScope, subscribeConsultantOwnership } from "./consultant-tenancy";
import { fetchConsultantFieldOfficers, fetchConsultantProjects, fetchFieldAssignments, normalizeCloudAssignment } from "./field-api";
import { reaRecordToDashboardProject, type ReaMapProjectRecord } from "./rea-project-map-data";
import { useInspectionWorkflow, type FieldOfficerAccount, type InspectionAssignment } from "./inspection-workflow";`,
  "portfolio live-data imports",
);

portfolio = replaceOnce(
  portfolio,
  ` const[revision,setRevision]=useState(0);
 const[liveFieldOfficers,setLiveFieldOfficers]=useState<FieldOfficerAccount[]|null>(null);

 useEffect(()=>{const refresh=()=>setRevision(value=>value+1);return subscribeConsultantOwnership(refresh);},[]);
 useEffect(()=>{
  if(session?.role!==\"consultant\"){setLiveFieldOfficers(null);return;}
  let cancelled=false;
  const load=()=>fetchConsultantFieldOfficers()
   .then((payload)=>{if(!cancelled)setLiveFieldOfficers(Array.isArray(payload?.fieldOfficers)?payload.fieldOfficers.map(normalizeLiveOfficer):[]);})
   .catch(()=>{if(!cancelled)setLiveFieldOfficers(null);});
  void load();`,
  ` const[revision,setRevision]=useState(0);
 const[liveFieldOfficers,setLiveFieldOfficers]=useState<FieldOfficerAccount[]|null>(null);
 const[liveAssignments,setLiveAssignments]=useState<InspectionAssignment[]|null>(null);
 const[liveProjects,setLiveProjects]=useState<ReturnType<typeof reaRecordToDashboardProject>[]|null>(null);

 useEffect(()=>{const refresh=()=>setRevision(value=>value+1);return subscribeConsultantOwnership(refresh);},[]);
 useEffect(()=>{
  if(session?.role!==\"consultant\"){setLiveFieldOfficers(null);setLiveAssignments(null);setLiveProjects(null);return;}
  let cancelled=false;
  const load=()=>Promise.all([
   fetchConsultantFieldOfficers().then((payload)=>Array.isArray(payload?.fieldOfficers)?payload.fieldOfficers.map(normalizeLiveOfficer):[]),
   fetchFieldAssignments().then((payload)=>Array.isArray(payload?.assignments)?payload.assignments.map(normalizeCloudAssignment):[]),
   fetchConsultantProjects().then((payload)=>Array.isArray(payload?.projects)?(payload.projects as ReaMapProjectRecord[]).map(reaRecordToDashboardProject):[]),
  ]).then(([officers,liveAssignmentsResult,liveProjectsResult])=>{
   if(cancelled)return;
   setLiveFieldOfficers(officers);
   setLiveAssignments(liveAssignmentsResult as InspectionAssignment[]);
   setLiveProjects(liveProjectsResult);
  }).catch(()=>{if(!cancelled){setLiveFieldOfficers(null);setLiveAssignments(null);setLiveProjects(null);}});
  void load();`,
  "portfolio live-data state and loader",
);

portfolio = replaceOnce(
  portfolio,
  ` return useMemo(()=>{
  const consultants=readConsultants();
  const consultant=session?.role===\"consultant\"?resolveSessionConsultant(session.email,session.consultantId,consultants):null;
  if(!consultant)return{consultant:null,fieldOfficers:[],ownedAssignments:[],visibleAssignments:[],projects:[],unallocatedProjects:[]};
  const scoped=selectConsultantScope(consultant.id,localFieldOfficers,assignments,projects,readConsultantOwnership());
  return{consultant,...scoped,fieldOfficers:liveFieldOfficers??scoped.fieldOfficers};
 },[assignments,localFieldOfficers,liveFieldOfficers,revision,session]);
}`,
  ` return useMemo(()=>{
  const consultants=readConsultants();
  const consultant=session?.role===\"consultant\"?resolveSessionConsultant(session.email,session.consultantId,consultants):null;
  if(!consultant)return{consultant:null,fieldOfficers:[],ownedAssignments:[],visibleAssignments:[],projects:[],unallocatedProjects:[]};
  if(liveAssignments&&liveProjects){
   // Server-scoped path: assignments and projects came from endpoints that
   // filter by consultant_firm in D1, so no further client-side ownership
   // filtering is needed (or trustworthy) here.
   const ownedAssignments=liveAssignments;
   const visibleAssignments=ownedAssignments.filter(isConsultantVisibleAssignment);
   const assignedProjectNames=new Set(ownedAssignments.map((item)=>item.projectName));
   const unallocatedProjects=liveProjects.filter((project)=>!assignedProjectNames.has(project.name));
   return{consultant,fieldOfficers:liveFieldOfficers??[],ownedAssignments,visibleAssignments,projects:liveProjects,unallocatedProjects};
  }
  // Fallback while the live request is in flight or unavailable (e.g. offline
  // demo mode): local mock data filtered by the localStorage ownership map.
  const scoped=selectConsultantScope(consultant.id,localFieldOfficers,assignments,projects,readConsultantOwnership());
  return{consultant,...scoped,fieldOfficers:liveFieldOfficers??scoped.fieldOfficers};
 },[assignments,localFieldOfficers,liveFieldOfficers,liveAssignments,liveProjects,revision,session]);
}`,
  "portfolio server-scoped return path",
);
fs.writeFileSync(portfolioPath, portfolio);

// Guardrails: fail deployment if any critical part did not land.
const checks = [
  [worker, "async function consultantProjectsResponse", "consultant projects handler"],
  [worker, '"/api/consultant/projects"', "consultant projects route"],
  [api, "fetchConsultantProjects", "consultant projects client fetcher"],
  [portfolio, "fetchConsultantProjects", "portfolio live projects wiring"],
  [portfolio, "fetchFieldAssignments", "portfolio live assignments wiring"],
  [portfolio, "liveAssignments&&liveProjects", "portfolio server-scoped return path"],
];
for (const [source, needle, label] of checks) if (!source.includes(needle)) throw new Error(`${label} missing after patch`);

console.log("Applied consultant project/assignment server-side data isolation patch");
