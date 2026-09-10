import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { defaultFieldOfficers, FIELD_OFFICERS_STORAGE_KEY, type FieldOfficerAccount } from "./inspection-workflow";
import { readConsultants } from "./consultants";
import { getOfficerConsultant } from "./consultant-tenancy";
import { appendAuditEvent, readReaStaff } from "./rea-admin";
import { authenticateFieldApi } from "./field-api";

export type DemoRole = "rea" | "field" | "consultant";
export type DemoAccount = { role: DemoRole; roleLabel: string; name: string; initials: string; email: string; password: string; path: string; consultantId?: string; };
export const demoAccounts: DemoAccount[] = [
 { role:"rea", roleLabel:"REA Dashboard", name:"REA Administrator", initials:"RA", email:"rea.admin@demo.ng", password:"REA2024!", path:"/" },
 { role:"field", roleLabel:"Field Officer", name:"Amina Yusuf", initials:"AY", email:"field.officer@demo.ng", password:"Field2024!", path:"/field-officer", consultantId:"con-001" },
 { role:"consultant", roleLabel:"Consultant Admin", name:"Ibrahim Musa", initials:"IM", email:"consultant.admin@demo.ng", password:"Consult2024!", path:"/consultant-admin", consultantId:"con-001" },
];
export type AuthSession = Omit<DemoAccount,"password"> & { access?: string[]; apiToken?: string; apiExpiresAt?: string };
type LoginAccount = DemoAccount & { access?: string[] };
type AuthContextValue={session:AuthSession|null;login:(email:string,password:string)=>Promise<AuthSession|null>;logout:()=>void;};
const SESSION_KEY="rea-demo-session"; const AuthContext=createContext<AuthContextValue|null>(null);

function initials(name:string){return name.split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("");}
function managedFieldOfficers(){
 let officers=defaultFieldOfficers;
 if(typeof window!=="undefined")try{const stored=window.localStorage.getItem(FIELD_OFFICERS_STORAGE_KEY);if(stored)officers=JSON.parse(stored) as FieldOfficerAccount[];}catch{officers=defaultFieldOfficers;}
 return officers;
}

export function authenticateDemoAccount(email:string,password:string):LoginAccount|null{
 const normalized=email.trim().toLowerCase();
 const reaStaff=readReaStaff();
 const staff=reaStaff.find(x=>x.email.toLowerCase()===normalized);
 if(staff){
  if(staff.status!=="Active"||staff.password!==password)return null;
  return {role:"rea",roleLabel:staff.role,name:staff.name,initials:initials(staff.name),email:staff.email,password:staff.password,path:"/",access:[...staff.access]};
 }
 const consultant=readConsultants().find(x=>x.adminEmail.toLowerCase()===normalized);
 if(consultant){
  if(consultant.status!=="Active"||consultant.temporaryPassword!==password)return null;
  return {role:"consultant",roleLabel:"Consultant Admin",name:consultant.adminName,initials:initials(consultant.adminName),email:consultant.adminEmail,password:consultant.temporaryPassword,path:"/consultant-admin",consultantId:consultant.id};
 }
 const officer=managedFieldOfficers().find(x=>x.email.toLowerCase()===normalized);
 if(officer){
  if(officer.status!=="Active"||officer.password!==password)return null;
  return{role:"field",roleLabel:"Field Officer",name:officer.name,initials:initials(officer.name),email:officer.email,password:officer.password,path:"/field-officer",consultantId:getOfficerConsultant(officer.email)??undefined};
 }
 return demoAccounts.find(x=>x.email.toLowerCase()===normalized&&x.password===password&&x.role!=="field"&&x.role!=="rea")??null;
}

function hydrateSession(session:AuthSession):AuthSession|null{
 if(session.role==="rea"){
  const staff=readReaStaff().find(account=>account.email.toLowerCase()===session.email.toLowerCase());
  if(!staff||staff.status!=="Active")return null;
  return {...session,roleLabel:staff.role,name:staff.name,initials:initials(staff.name),email:staff.email,access:[...staff.access]};
 }
 if(session.role==="consultant"){
  const consultant=readConsultants().find(account=>account.adminEmail.toLowerCase()===session.email.toLowerCase());
  if(!consultant||consultant.status!=="Active")return session.email==="consultant.admin@demo.ng"?session:null;
  return {...session,name:consultant.adminName,initials:initials(consultant.adminName),consultantId:consultant.id};
 }
 if(session.role==="field"){
  const officer=managedFieldOfficers().find(account=>account.email.toLowerCase()===session.email.toLowerCase());
  if(!officer||officer.status!=="Active")return null;
  return {...session,name:officer.name,initials:initials(officer.name),consultantId:getOfficerConsultant(officer.email)??session.consultantId};
 }
 return session;
}
function readSession():AuthSession|null{
 if(typeof window==="undefined")return null;
 try{
  const raw=window.sessionStorage.getItem(SESSION_KEY);
  if(!raw)return null;
  const hydrated=hydrateSession(JSON.parse(raw) as AuthSession);
  if(!hydrated){window.sessionStorage.removeItem(SESSION_KEY);return null;}
  window.sessionStorage.setItem(SESSION_KEY,JSON.stringify(hydrated));
  return hydrated;
 }catch{return null}
}

export function AuthProvider({children}:{children:ReactNode}){
 const[session,setSession]=useState<AuthSession|null>(readSession);
 useEffect(()=>{
  const refresh=()=>{
   setSession(current=>{
    if(!current)return current;
    const hydrated=hydrateSession(current);
    if(!hydrated){window.sessionStorage.removeItem(SESSION_KEY);return null;}
    window.sessionStorage.setItem(SESSION_KEY,JSON.stringify(hydrated));
    return hydrated;
   });
  };
  window.addEventListener("veritas-rea-staff-updated",refresh);
  window.addEventListener("veritas-consultant-ownership-updated",refresh);
  window.addEventListener("storage",refresh);
  return()=>{window.removeEventListener("veritas-rea-staff-updated",refresh);window.removeEventListener("veritas-consultant-ownership-updated",refresh);window.removeEventListener("storage",refresh);};
 },[]);
 const login=async(email:string,password:string)=>{
  const account=authenticateDemoAccount(email,password);if(!account)return null;
  let cloud;try{cloud=await authenticateFieldApi(email,password)}catch{return null}
  const expected={rea:"rea_admin",field:"field_officer",consultant:"consultant_admin"}[account.role];if(cloud.user.role!==expected)return null;
  if(account.role==="rea")appendAuditEvent({actor:account.name,action:"Signed in",category:"Authentication",target:"REA Dashboard",details:`Successful login for ${account.email}`,severity:"Success"});
  const{password:_password,...baseSession}=account;const nextSession={...baseSession,apiToken:cloud.token,apiExpiresAt:cloud.expiresAt};setSession(nextSession);window.sessionStorage.setItem(SESSION_KEY,JSON.stringify(nextSession));window.dispatchEvent(new Event("veritas-cloud-session"));return nextSession;
 };
 const logout=()=>{if(session?.role==="rea")appendAuditEvent({actor:session.name,action:"Signed out",category:"Authentication",target:"REA Dashboard",details:"User ended dashboard session",severity:"Info"});if(session?.apiToken)void fetch("/api/field/auth/logout",{method:"POST",headers:{Authorization:`Bearer ${session.apiToken}`}}).catch(()=>undefined);setSession(null);window.sessionStorage.removeItem(SESSION_KEY);};
 return <AuthContext.Provider value={{session,login,logout}}>{children}</AuthContext.Provider>
}
export function useAuth(){const c=useContext(AuthContext);if(!c)throw new Error("useAuth must be used inside AuthProvider");return c;}
export function RequireRole({role,children}:{role:DemoRole;children:ReactNode}){const{session}=useAuth();const location=useLocation();if(!session)return <Navigate to="/login" replace state={{from:location.pathname}}/>;if(session.role!==role)return <Navigate to={session.path} replace/>;return children;}
