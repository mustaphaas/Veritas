import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import { projects } from "./dashboard-data";
import { readConsultants, type ConsultantRecord } from "./consultants";
import { readConsultantOwnership, isConsultantVisibleAssignment, selectConsultantScope, subscribeConsultantOwnership } from "./consultant-tenancy";
import { fetchConsultantFieldOfficers, fetchConsultantProjects, fetchFieldAssignments, normalizeCloudAssignment } from "./field-api";
import { reaRecordToDashboardProject, type ReaMapProjectRecord } from "./rea-project-map-data";
import { useInspectionWorkflow, type FieldOfficerAccount, type InspectionAssignment } from "./inspection-workflow";

export function resolveSessionConsultant(email:string|undefined,consultantId:string|undefined,consultants:ConsultantRecord[]){
 const normalizedEmail=email?.trim().toLowerCase();
 return consultants.find(record=>Boolean(normalizedEmail)&&record.adminEmail.trim().toLowerCase()===normalizedEmail)??consultants.find(record=>record.id===consultantId)??null;
}

function normalizeLiveOfficer(officer:any):FieldOfficerAccount{
 return{
  id:String(officer.id||""),
  name:String(officer.name||"Field Officer"),
  email:String(officer.email||""),
  phone:String(officer.phone||""),
  zone:"Assigned by consultant",
  device:"Registered device",
  password:"",
  status:officer.status==="Suspended"?"Suspended":"Active",
  createdAt:String(officer.createdAt||new Date().toISOString()),
 };
}

export function useConsultantPortfolio(){
 const{session}=useAuth();
 const{assignments,fieldOfficers:localFieldOfficers}=useInspectionWorkflow();
 const[revision,setRevision]=useState(0);
 const[liveFieldOfficers,setLiveFieldOfficers]=useState<FieldOfficerAccount[]|null>(null);
 const[liveAssignments,setLiveAssignments]=useState<InspectionAssignment[]|null>(null);
 const[liveProjects,setLiveProjects]=useState<ReturnType<typeof reaRecordToDashboardProject>[]|null>(null);

 useEffect(()=>{const refresh=()=>setRevision(value=>value+1);return subscribeConsultantOwnership(refresh);},[]);
 useEffect(()=>{
  if(session?.role!=="consultant"){setLiveFieldOfficers(null);setLiveAssignments(null);setLiveProjects(null);return;}
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
  void load();
  const timer=window.setInterval(load,30000);
  const refresh=()=>void load();
  window.addEventListener("veritas-cloud-session",refresh);
  window.addEventListener("focus",refresh);
  return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener("veritas-cloud-session",refresh);window.removeEventListener("focus",refresh);};
 },[session?.role,session?.email,session?.consultantId]);

 return useMemo(()=>{
  const consultants=readConsultants();
  const consultant=session?.role==="consultant"?resolveSessionConsultant(session.email,session.consultantId,consultants):null;
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
}
