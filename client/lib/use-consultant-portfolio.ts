import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import { projects } from "./dashboard-data";
import { readConsultants, type ConsultantRecord } from "./consultants";
import { readConsultantOwnership, selectConsultantScope, subscribeConsultantOwnership } from "./consultant-tenancy";
import { fetchConsultantFieldOfficers } from "./field-api";
import { useInspectionWorkflow, type FieldOfficerAccount } from "./inspection-workflow";

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

 useEffect(()=>{const refresh=()=>setRevision(value=>value+1);return subscribeConsultantOwnership(refresh);},[]);
 useEffect(()=>{
  if(session?.role!=="consultant"){setLiveFieldOfficers(null);return;}
  let cancelled=false;
  const load=()=>fetchConsultantFieldOfficers()
   .then((payload)=>{if(!cancelled)setLiveFieldOfficers(Array.isArray(payload?.fieldOfficers)?payload.fieldOfficers.map(normalizeLiveOfficer):[]);})
   .catch(()=>{if(!cancelled)setLiveFieldOfficers(null);});
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
  const scoped=selectConsultantScope(consultant.id,localFieldOfficers,assignments,projects,readConsultantOwnership());
  return{consultant,...scoped,fieldOfficers:liveFieldOfficers??scoped.fieldOfficers};
 },[assignments,localFieldOfficers,liveFieldOfficers,revision,session]);
}
