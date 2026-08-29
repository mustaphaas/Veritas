import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { defaultFieldOfficers, FIELD_OFFICERS_STORAGE_KEY, type FieldOfficerAccount } from "./inspection-workflow";
import { appendAuditEvent, readReaStaff } from "./rea-admin";

export type DemoRole = "rea" | "field" | "consultant";
export type DemoAccount = { role: DemoRole; roleLabel: string; name: string; initials: string; email: string; password: string; path: string; };
export const demoAccounts: DemoAccount[] = [
 { role:"rea", roleLabel:"REA Dashboard", name:"REA Administrator", initials:"RA", email:"rea.admin@demo.ng", password:"REA2024!", path:"/" },
 { role:"field", roleLabel:"Field Officer", name:"Amina Yusuf", initials:"AY", email:"field.officer@demo.ng", password:"Field2024!", path:"/field-officer" },
 { role:"consultant", roleLabel:"Consultant Admin", name:"Ibrahim Musa", initials:"IM", email:"consultant.admin@demo.ng", password:"Consult2024!", path:"/consultant-admin" },
];
export type AuthSession = Omit<DemoAccount,"password"> & { access?: string[] };
type LoginAccount = DemoAccount & { access?: string[] };
type AuthContextValue={session:AuthSession|null;login:(email:string,password:string)=>Promise<AuthSession|null>;logout:()=>void;};
const SESSION_KEY="rea-demo-session"; const AuthContext=createContext<AuthContextValue|null>(null);

function initials(name:string){return name.split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("");}

export function authenticateDemoAccount(email:string,password:string):LoginAccount|null{
 const normalized=email.trim().toLowerCase();
 const reaStaff=readReaStaff();
 const staff=reaStaff.find(x=>x.email.toLowerCase()===normalized);
 if(staff){
  if(staff.status!=="Active"||staff.password!==password)return null;
  return {role:"rea",roleLabel:staff.role,name:staff.name,initials:initials(staff.name),email:staff.email,password:staff.password,path:"/",access:[...staff.access]};
 }
 let managedOfficers=defaultFieldOfficers;
 if(typeof window!=="undefined")try{const stored=window.localStorage.getItem(FIELD_OFFICERS_STORAGE_KEY);if(stored)managedOfficers=JSON.parse(stored) as FieldOfficerAccount[];}catch{managedOfficers=defaultFieldOfficers;}
 const officer=managedOfficers.find(x=>x.email.toLowerCase()===normalized);
 if(officer){if(officer.status!=="Active"||officer.password!==password)return null;return{role:"field",roleLabel:"Field Officer",name:officer.name,initials:initials(officer.name),email:officer.email,password:officer.password,path:"/field-officer"};}
 return demoAccounts.find(x=>x.email.toLowerCase()===normalized&&x.password===password&&x.role!=="field"&&x.role!=="rea")??null;
}

function hydrateReaSession(session:AuthSession):AuthSession|null{
 if(session.role!=="rea")return session;
 const staff=readReaStaff().find(account=>account.email.toLowerCase()===session.email.toLowerCase());
 if(!staff||staff.status!=="Active")return null;
 return {...session,roleLabel:staff.role,name:staff.name,initials:initials(staff.name),email:staff.email,access:[...staff.access]};
}
function readSession():AuthSession|null{
 if(typeof window==="undefined")return null;
 try{
  const raw=window.sessionStorage.getItem(SESSION_KEY);
  if(!raw)return null;
  const hydrated=hydrateReaSession(JSON.parse(raw) as AuthSession);
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
    if(!current||current.role!=="rea")return current;
    const hydrated=hydrateReaSession(current);
    if(!hydrated){window.sessionStorage.removeItem(SESSION_KEY);return null;}
    window.sessionStorage.setItem(SESSION_KEY,JSON.stringify(hydrated));
    return hydrated;
   });
  };
  window.addEventListener("veritas-rea-staff-updated",refresh);
  window.addEventListener("storage",refresh);
  return()=>{window.removeEventListener("veritas-rea-staff-updated",refresh);window.removeEventListener("storage",refresh);};
 },[]);
 const login=async(email:string,password:string)=>{
  const account=authenticateDemoAccount(email,password);if(!account)return null;
  if(account.role==="rea"){appendAuditEvent({actor:account.name,action:"Signed in",category:"Authentication",target:"REA Dashboard",details:`Successful login for ${account.email}`,severity:"Success"});try{const response=await fetch("/api/auth/veritas-session",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});if(!response.ok)console.warn("Veritas AI session is not available yet.");}catch{}}
  const{password:_password,...nextSession}=account;setSession(nextSession);window.sessionStorage.setItem(SESSION_KEY,JSON.stringify(nextSession));return nextSession;
 };
 const logout=()=>{if(session?.role==="rea")appendAuditEvent({actor:session.name,action:"Signed out",category:"Authentication",target:"REA Dashboard",details:"User ended dashboard session",severity:"Info"});void fetch("/api/auth/veritas-session",{method:"DELETE",credentials:"same-origin"}).catch(()=>undefined);setSession(null);window.sessionStorage.removeItem(SESSION_KEY);};
 return <AuthContext.Provider value={{session,login,logout}}>{children}</AuthContext.Provider>
}
export function useAuth(){const c=useContext(AuthContext);if(!c)throw new Error("useAuth must be used inside AuthProvider");return c;}
export function RequireRole({role,children}:{role:DemoRole;children:ReactNode}){const{session}=useAuth();const location=useLocation();if(!session)return <Navigate to="/login" replace state={{from:location.pathname}}/>;if(session.role!==role)return <Navigate to={session.path} replace/>;return children;}
