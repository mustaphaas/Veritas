from pathlib import Path

index_path = Path("client/pages/Index.tsx")
auth_path = Path("client/lib/auth.tsx")
admin_path = Path("client/lib/rea-admin.ts")

index = index_path.read_text()
admin = admin_path.read_text()

# 1) Align the permission name with the actual dashboard tab and migrate old saved values.
admin = admin.replace(
    'export const reaAccessModules = ["Overview", "Claims", "Verification", "Contractors", "Analytics", "Reports", "Users", "Audit Trail"];',
    'export const reaAccessModules = ["Overview", "Claims", "Verification", "Consultants", "Analytics", "Reports", "Users", "Audit Trail"];',
    1,
)
admin = admin.replace(
    'access: ["Overview", "Claims", "Verification", "Contractors", "Analytics", "Reports"],',
    'access: ["Overview", "Claims", "Verification", "Consultants", "Analytics", "Reports"],',
    1,
)

helper_anchor = 'export const reaAccessModules = ["Overview", "Claims", "Verification", "Consultants", "Analytics", "Reports", "Users", "Audit Trail"];\n'
helper = '''\nexport function normalizeReaAccess(value: unknown, fallback: string[] = []): string[] {\n  const source = Array.isArray(value) ? value : fallback;\n  return [...new Set(\n    source\n      .filter((module): module is string => typeof module === "string")\n      .map((module) => module === "Contractors" ? "Consultants" : module)\n      .filter((module) => reaAccessModules.includes(module)),\n  )];\n}\n'''
if 'export function normalizeReaAccess' not in admin:
    if helper_anchor not in admin:
        raise RuntimeError("reaAccessModules anchor not found")
    admin = admin.replace(helper_anchor, helper_anchor + helper, 1)

old_access_read = 'access: Array.isArray(value.access) ? value.access.filter((module): module is string => typeof module === "string") : [...fallback.access],'
new_access_read = 'access: normalizeReaAccess(value.access, fallback.access),'
if old_access_read not in admin:
    raise RuntimeError("readReaStaff access parser changed")
admin = admin.replace(old_access_read, new_access_read, 1)

old_write = '''export function writeReaStaff(accounts: ReaStaffAccount[]) {\n  if (typeof window === "undefined") return;\n  try {\n    window.localStorage.setItem(REA_STAFF_STORAGE_KEY, JSON.stringify(accounts));\n  } catch {\n    // Keep the current in-memory view usable when browser storage is unavailable.\n  }\n}'''
new_write = '''export function writeReaStaff(accounts: ReaStaffAccount[]) {\n  if (typeof window === "undefined") return;\n  try {\n    const normalized = accounts.map((account) => ({\n      ...account,\n      access: normalizeReaAccess(account.access),\n    }));\n    window.localStorage.setItem(REA_STAFF_STORAGE_KEY, JSON.stringify(normalized));\n    window.dispatchEvent(new CustomEvent("veritas-rea-staff-updated"));\n  } catch {\n    // Keep the current in-memory view usable when browser storage is unavailable.\n  }\n}'''
if old_write not in admin:
    raise RuntimeError("writeReaStaff block changed")
admin = admin.replace(old_write, new_write, 1)
admin_path.write_text(admin)

# 2) Carry managed REA permissions in the authenticated session and refresh them live.
auth = '''import { createContext, useContext, useEffect, useState, type ReactNode } from "react";\nimport { Navigate, useLocation } from "react-router-dom";\nimport { defaultFieldOfficers, FIELD_OFFICERS_STORAGE_KEY, type FieldOfficerAccount } from "./inspection-workflow";\nimport { appendAuditEvent, readReaStaff } from "./rea-admin";\n\nexport type DemoRole = "rea" | "field" | "consultant";\nexport type DemoAccount = { role: DemoRole; roleLabel: string; name: string; initials: string; email: string; password: string; path: string; };\nexport const demoAccounts: DemoAccount[] = [\n { role:"rea", roleLabel:"REA Dashboard", name:"REA Administrator", initials:"RA", email:"rea.admin@demo.ng", password:"REA2024!", path:"/" },\n { role:"field", roleLabel:"Field Officer", name:"Amina Yusuf", initials:"AY", email:"field.officer@demo.ng", password:"Field2024!", path:"/field-officer" },\n { role:"consultant", roleLabel:"Consultant Admin", name:"Ibrahim Musa", initials:"IM", email:"consultant.admin@demo.ng", password:"Consult2024!", path:"/consultant-admin" },\n];\nexport type AuthSession = Omit<DemoAccount,"password"> & { access?: string[] };\ntype LoginAccount = DemoAccount & { access?: string[] };\ntype AuthContextValue={session:AuthSession|null;login:(email:string,password:string)=>Promise<AuthSession|null>;logout:()=>void;};\nconst SESSION_KEY="rea-demo-session"; const AuthContext=createContext<AuthContextValue|null>(null);\n\nfunction initials(name:string){return name.split(/\\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("");}\n\nexport function authenticateDemoAccount(email:string,password:string):LoginAccount|null{\n const normalized=email.trim().toLowerCase();\n const reaStaff=readReaStaff();\n const staff=reaStaff.find(x=>x.email.toLowerCase()===normalized);\n if(staff){\n  if(staff.status!=="Active"||staff.password!==password)return null;\n  return {role:"rea",roleLabel:staff.role,name:staff.name,initials:initials(staff.name),email:staff.email,password:staff.password,path:"/",access:[...staff.access]};\n }\n let managedOfficers=defaultFieldOfficers;\n if(typeof window!=="undefined")try{const stored=window.localStorage.getItem(FIELD_OFFICERS_STORAGE_KEY);if(stored)managedOfficers=JSON.parse(stored) as FieldOfficerAccount[];}catch{managedOfficers=defaultFieldOfficers;}\n const officer=managedOfficers.find(x=>x.email.toLowerCase()===normalized);\n if(officer){if(officer.status!=="Active"||officer.password!==password)return null;return{role:"field",roleLabel:"Field Officer",name:officer.name,initials:initials(officer.name),email:officer.email,password:officer.password,path:"/field-officer"};}\n return demoAccounts.find(x=>x.email.toLowerCase()===normalized&&x.password===password&&x.role!=="field"&&x.role!=="rea")??null;\n}\n\nfunction hydrateReaSession(session:AuthSession):AuthSession|null{\n if(session.role!=="rea")return session;\n const staff=readReaStaff().find(account=>account.email.toLowerCase()===session.email.toLowerCase());\n if(!staff||staff.status!=="Active")return null;\n return {...session,roleLabel:staff.role,name:staff.name,initials:initials(staff.name),email:staff.email,access:[...staff.access]};\n}\nfunction readSession():AuthSession|null{\n if(typeof window==="undefined")return null;\n try{\n  const raw=window.sessionStorage.getItem(SESSION_KEY);\n  if(!raw)return null;\n  const hydrated=hydrateReaSession(JSON.parse(raw) as AuthSession);\n  if(!hydrated){window.sessionStorage.removeItem(SESSION_KEY);return null;}\n  window.sessionStorage.setItem(SESSION_KEY,JSON.stringify(hydrated));\n  return hydrated;\n }catch{return null}\n}\n\nexport function AuthProvider({children}:{children:ReactNode}){\n const[session,setSession]=useState<AuthSession|null>(readSession);\n useEffect(()=>{\n  const refresh=()=>{\n   setSession(current=>{\n    if(!current||current.role!=="rea")return current;\n    const hydrated=hydrateReaSession(current);\n    if(!hydrated){window.sessionStorage.removeItem(SESSION_KEY);return null;}\n    window.sessionStorage.setItem(SESSION_KEY,JSON.stringify(hydrated));\n    return hydrated;\n   });\n  };\n  window.addEventListener("veritas-rea-staff-updated",refresh);\n  window.addEventListener("storage",refresh);\n  return()=>{window.removeEventListener("veritas-rea-staff-updated",refresh);window.removeEventListener("storage",refresh);};\n },[]);\n const login=async(email:string,password:string)=>{\n  const account=authenticateDemoAccount(email,password);if(!account)return null;\n  if(account.role==="rea"){appendAuditEvent({actor:account.name,action:"Signed in",category:"Authentication",target:"REA Dashboard",details:`Successful login for ${account.email}`,severity:"Success"});try{const response=await fetch("/api/auth/veritas-session",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});if(!response.ok)console.warn("Veritas AI session is not available yet.");}catch{}}\n  const{password:_password,...nextSession}=account;setSession(nextSession);window.sessionStorage.setItem(SESSION_KEY,JSON.stringify(nextSession));return nextSession;\n };\n const logout=()=>{if(session?.role==="rea")appendAuditEvent({actor:session.name,action:"Signed out",category:"Authentication",target:"REA Dashboard",details:"User ended dashboard session",severity:"Info"});void fetch("/api/auth/veritas-session",{method:"DELETE",credentials:"same-origin"}).catch(()=>undefined);setSession(null);window.sessionStorage.removeItem(SESSION_KEY);};\n return <AuthContext.Provider value={{session,login,logout}}>{children}</AuthContext.Provider>\n}\nexport function useAuth(){const c=useContext(AuthContext);if(!c)throw new Error("useAuth must be used inside AuthProvider");return c;}\nexport function RequireRole({role,children}:{role:DemoRole;children:ReactNode}){const{session}=useAuth();const location=useLocation();if(!session)return <Navigate to="/login" replace state={{from:location.pathname}}/>;if(session.role!==role)return <Navigate to={session.path} replace/>;return children;}\n'''
auth_path.write_text(auth)

# 3) Enforce the session permissions in REA navigation and rendering.
old = '  const { logout } = useAuth();'
new = '  const { session, logout } = useAuth();'
if old not in index:
    raise RuntimeError("useAuth destructuring changed")
index = index.replace(old, new, 1)

anchor = '  const [activeNav, setActiveNav] = useState("Overview");\n'
access_block = '''  const accessKey = session?.access?.join("|") ?? "";\n  const visibleNavigation = useMemo(() => {\n    if (session?.role !== "rea") return navigation;\n    const allowed = new Set(session.access ?? []);\n    return navigation.filter((item) => allowed.has(item.label));\n  }, [session?.role, accessKey]);\n  const resolvedActiveNav = visibleNavigation.some((item) => item.label === activeNav)\n    ? activeNav\n    : visibleNavigation[0]?.label ?? "";\n  useEffect(() => {\n    if (resolvedActiveNav && resolvedActiveNav !== activeNav) setActiveNav(resolvedActiveNav);\n  }, [activeNav, resolvedActiveNav]);\n'''
if anchor not in index:
    raise RuntimeError("activeNav anchor changed")
index = index.replace(anchor, anchor + access_block, 1)

old_nav = 'navigation.map(({ label, icon: Icon }) => <button key={label}'
new_nav = 'visibleNavigation.map(({ label, icon: Icon }) => <button key={label}'
if old_nav not in index:
    raise RuntimeError("navigation map changed")
index = index.replace(old_nav, new_nav, 1)

# All tab comparisons and active styling use the permission-resolved module.
index = index.replace('activeNav ===', 'resolvedActiveNav ===')

old_header = '<span className="hidden text-xs font-semibold text-[#142a1f] xl:inline">REA Administrator</span>'
new_header = '<span className="hidden text-xs font-semibold text-[#142a1f] xl:inline">{session?.name ?? "REA Administrator"}</span>'
if old_header not in index:
    raise RuntimeError("header user label changed")
index = index.replace(old_header, new_header, 1)

content_anchor = '          {resolvedActiveNav === "Analytics" ? ('
blocked = '''          {!resolvedActiveNav ? (\n            <section className="my-6 rounded-xl border border-amber-200 bg-white p-8 text-center shadow-sm">\n              <LockKeyhole className="mx-auto h-8 w-8 text-amber-600" />\n              <h2 className="mt-3 text-base font-bold text-[#173b2a]">No dashboard access assigned</h2>\n              <p className="mt-2 text-xs text-slate-500">Your account is active, but an REA Administrator has not assigned any dashboard modules.</p>\n            </section>\n          ) : resolvedActiveNav === "Analytics" ? ('''
if content_anchor not in index:
    raise RuntimeError("content switch anchor changed")
index = index.replace(content_anchor, blocked, 1)

# Index needs the lock icon for the no-access state.
index = index.replace('  LogOut,\n  Home,', '  LogOut,\n  LockKeyhole,\n  Home,', 1)

index_path.write_text(index)
print("REA access control now enforced in session, navigation, and tab rendering")
