import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import { projects } from "./dashboard-data";
import { readConsultants, type ConsultantRecord } from "./consultants";
import { readConsultantOwnership, selectConsultantScope, subscribeConsultantOwnership } from "./consultant-tenancy";
import { useInspectionWorkflow } from "./inspection-workflow";

export function resolveSessionConsultant(email:string|undefined,consultantId:string|undefined,consultants:ConsultantRecord[]){
 const normalizedEmail=email?.trim().toLowerCase();
 return consultants.find(record=>Boolean(normalizedEmail)&&record.adminEmail.trim().toLowerCase()===normalizedEmail)??consultants.find(record=>record.id===consultantId)??null;
}

export function useConsultantPortfolio(){
 const{session}=useAuth(); const{assignments,fieldOfficers}=useInspectionWorkflow(); const[revision,setRevision]=useState(0);
 useEffect(()=>{const refresh=()=>setRevision(value=>value+1);return subscribeConsultantOwnership(refresh);},[]);
 return useMemo(()=>{const consultants=readConsultants();const consultant=session?.role==="consultant"?resolveSessionConsultant(session.email,session.consultantId,consultants):null;if(!consultant)return{consultant:null,fieldOfficers:[],ownedAssignments:[],visibleAssignments:[],projects:[],unallocatedProjects:[]};return{consultant,...selectConsultantScope(consultant.id,fieldOfficers,assignments,projects,readConsultantOwnership())};},[assignments,fieldOfficers,revision,session]);
}
