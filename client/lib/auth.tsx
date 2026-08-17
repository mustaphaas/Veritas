import { createContext, useContext, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  defaultFieldOfficers,
  FIELD_OFFICERS_STORAGE_KEY,
  type FieldOfficerAccount,
} from "./inspection-workflow";

export type DemoRole = "rea" | "field" | "consultant";

export type DemoAccount = {
  role: DemoRole;
  roleLabel: string;
  name: string;
  initials: string;
  email: string;
  password: string;
  path: string;
};

export const demoAccounts: DemoAccount[] = [
  {
    role: "rea",
    roleLabel: "REA Dashboard",
    name: "REA Administrator",
    initials: "RA",
    email: "rea.admin@demo.ng",
    password: "REA2024!",
    path: "/",
  },
  {
    role: "field",
    roleLabel: "Field Officer",
    name: "Amina Yusuf",
    initials: "AY",
    email: "field.officer@demo.ng",
    password: "Field2024!",
    path: "/field-officer",
  },
  {
    role: "consultant",
    roleLabel: "Consultant Admin",
    name: "Ibrahim Musa",
    initials: "IM",
    email: "consultant.admin@demo.ng",
    password: "Consult2024!",
    path: "/consultant-admin",
  },
];

export type AuthSession = Omit<DemoAccount, "password">;

type AuthContextValue = {
  session: AuthSession | null;
  login: (email: string, password: string) => AuthSession | null;
  logout: () => void;
};

const SESSION_KEY = "rea-demo-session";
const AuthContext = createContext<AuthContextValue | null>(null);

export function authenticateDemoAccount(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  let managedOfficers = defaultFieldOfficers;
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(FIELD_OFFICERS_STORAGE_KEY);
      if (stored) managedOfficers = JSON.parse(stored) as FieldOfficerAccount[];
    } catch {
      managedOfficers = defaultFieldOfficers;
    }
  }
  const managedOfficer = managedOfficers.find(
    (candidate) => candidate.email.toLowerCase() === normalizedEmail,
  );
  if (managedOfficer) {
    if (
      managedOfficer.status !== "Active" ||
      managedOfficer.password !== password
    ) {
      return null;
    }
    return {
      role: "field" as const,
      roleLabel: "Field Officer",
      name: managedOfficer.name,
      initials: managedOfficer.name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join(""),
      email: managedOfficer.email,
      password: managedOfficer.password,
      path: "/field-officer",
    };
  }
  return (
    demoAccounts.find(
      (candidate) =>
        candidate.email.toLowerCase() === normalizedEmail &&
        candidate.password === password &&
        candidate.role !== "field",
    ) ?? null
  );
}

function readSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    return stored ? (JSON.parse(stored) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readSession);

  const login = (email: string, password: string) => {
    const account = authenticateDemoAccount(email, password);
    if (!account) return null;
    const { password: _password, ...nextSession } = account;
    setSession(nextSession);
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    return nextSession;
  };

  const logout = () => {
    setSession(null);
    window.sessionStorage.removeItem(SESSION_KEY);
  };

  return (
    <AuthContext.Provider value={{ session, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function RequireRole({
  role,
  children,
}: {
  role: DemoRole;
  children: ReactNode;
}) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (session.role !== role) return <Navigate to={session.path} replace />;
  return children;
}
