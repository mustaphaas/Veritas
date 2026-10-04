import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { appendAuditEvent } from "./rea-admin";
import { authenticateFieldApi, fetchConsultantProfileWithToken } from "./field-api";

export type DemoRole = "rea" | "field" | "consultant";
export type AuthSession = {
  role: DemoRole;
  roleLabel: string;
  name: string;
  initials: string;
  email: string;
  path: string;
  consultantId?: string;
  access?: string[];
  apiToken?: string;
  apiExpiresAt?: string;
};

const isMeRole = (staffRole?: string) => staffRole === "M&E Admin" || staffRole === "M&E Officer";
const reaStaffPath = (staffRole?: string) => isMeRole(staffRole) ? "/me-dashboard" : "/";
type AuthContextValue={session:AuthSession|null;login:(email:string,password:string)=>Promise<AuthSession|null>;logout:()=>void;};
const SESSION_KEY="rea-cloud-session";
const AuthContext=createContext<AuthContextValue|null>(null);

function initials(name:string){return name.split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("");}

function hasUsableCloudSession(session:AuthSession){
  if(!session.apiToken||!session.apiExpiresAt)return false;
  const expiresAt=Date.parse(session.apiExpiresAt);
  return Number.isFinite(expiresAt)&&expiresAt>Date.now()+30_000;
}

function hydrateSession(session:AuthSession):AuthSession|null{
  if(!hasUsableCloudSession(session))return null;
  if(session.role==="rea")return {...session,path:reaStaffPath(session.roleLabel)};
  if(session.role==="consultant")return {...session,path:"/consultant-admin"};
  if(session.role==="field")return {...session,path:"/field-officer"};
  return null;
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
    window.addEventListener("veritas-cloud-session",refresh);
    window.addEventListener("storage",refresh);
    return()=>{window.removeEventListener("veritas-cloud-session",refresh);window.removeEventListener("storage",refresh);};
  },[]);

  const login=async(email:string,password:string)=>{
    let cloud;
    try{cloud=await authenticateFieldApi(email,password)}catch{return null}
    const cloudRole=({rea_admin:"rea",rea_staff:"rea",field_officer:"field",consultant_admin:"consultant"} as const)[cloud.user.role as "rea_admin"|"rea_staff"|"field_officer"|"consultant_admin"];
    if(!cloudRole)return null;

    let consultantId:string|undefined;
    if(cloudRole==="consultant"){
      try{
        const profile=await fetchConsultantProfileWithToken(cloud.token);
        consultantId=profile?.consultant?.id || undefined;
      }catch{
        return null;
      }
    }

    const account:AuthSession={
      role:cloudRole,
      roleLabel:cloudRole==="rea"?(cloud.user.staffRole||"REA Staff"):cloudRole==="consultant"?"Consultant Admin":"Field Officer",
      name:cloud.user.name||email,
      initials:initials(cloud.user.name||email),
      email:cloud.user.email||email,
      path:cloudRole==="rea"?reaStaffPath(cloud.user.staffRole):cloudRole==="consultant"?"/consultant-admin":"/field-officer",
      consultantId,
      access:cloudRole==="rea"?cloud.user.access:undefined,
      apiToken:cloud.token,
      apiExpiresAt:cloud.expiresAt,
    };

    if(account.role==="rea")appendAuditEvent({actor:account.name,action:"Signed in",category:"Authentication",target:"REA Dashboard",details:`Successful login for ${account.email}`,severity:"Success"});
    setSession(account);
    window.sessionStorage.setItem(SESSION_KEY,JSON.stringify(account));
    window.dispatchEvent(new Event("veritas-cloud-session"));
    return account;
  };

  const logout=()=>{
    if(session?.role==="rea")appendAuditEvent({actor:session.name,action:"Signed out",category:"Authentication",target:"REA Dashboard",details:"User ended dashboard session",severity:"Info"});
    if(session?.apiToken)void fetch("/api/field/auth/logout",{method:"POST",headers:{Authorization:`Bearer ${session.apiToken}`}}).catch(()=>undefined);
    setSession(null);
    window.sessionStorage.removeItem(SESSION_KEY);
  };

  return <AuthContext.Provider value={{session,login,logout}}>{children}</AuthContext.Provider>;
}
export function useAuth(){const c=useContext(AuthContext);if(!c)throw new Error("useAuth must be used inside AuthProvider");return c;}
export function RequireRole({role,children}:{role:DemoRole;children:ReactNode}){const{session}=useAuth();const location=useLocation();if(!session)return <Navigate to="/login" replace state={{from:location.pathname}}/>;if(session.role!==role)return <Navigate to={session.path} replace/>;return children;}
export function RequireReaStaffRole({staffRole,children}:{staffRole:string|string[];children:ReactNode}){const{session}=useAuth();const location=useLocation();if(!session)return <Navigate to="/login" replace state={{from:location.pathname}}/>;if(session.role!=="rea")return <Navigate to={session.path} replace/>;const allowed=Array.isArray(staffRole)?staffRole:[staffRole];if(!allowed.includes(session.roleLabel))return <Navigate to={session.path===location.pathname?"/":session.path} replace/>;return children;}
