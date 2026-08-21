import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";

export type DemoRole = "rea" | "field" | "consultant";

export type AuthSession = {
  id: string;
  role: DemoRole;
  roleLabel: string;
  name: string;
  initials: string;
  email: string;
  path: string;
};

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthSession | null>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "veritas-demo-session";

function makeSession(role: DemoRole, email: string, name: string): AuthSession {
  const labels: Record<DemoRole, string> = {
    rea: "REA Dashboard",
    field: "Field Officer",
    consultant: "Consultant Admin",
  };
  const paths: Record<DemoRole, string> = {
    rea: "/",
    field: "/field-officer",
    consultant: "/consultant-admin",
  };
  return {
    id: `demo-${role}`,
    role,
    roleLabel: labels[role],
    name,
    initials: name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(""),
    email,
    path: paths[role],
  };
}

const DEFAULT_REA_SESSION = makeSession(
  "rea",
  "rea.admin@veritas.local",
  "REA Administrator",
);

function readStoredSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.role || !["rea", "field", "consultant"].includes(parsed.role)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistSession(session: AuthSession | null) {
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browsers; the in-memory
    // session still keeps the demo usable for the current tab.
  }
}

function roleFromEmail(email: string): DemoRole {
  const value = email.toLowerCase();
  if (value.includes("field")) return "field";
  if (value.includes("consultant")) return "consultant";
  return "rea";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restored = readStoredSession() ?? DEFAULT_REA_SESSION;
    setSession(restored);
    persistSession(restored);
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) return null;
    const role = roleFromEmail(cleanEmail);
    const names: Record<DemoRole, string> = {
      rea: "REA Administrator",
      field: "Field Officer",
      consultant: "Consultant Administrator",
    };
    const nextSession = makeSession(role, cleanEmail, names[role]);
    setSession(nextSession);
    persistSession(nextSession);
    return nextSession;
  };

  const logout = () => {
    persistSession(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, login, logout }}>
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
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef6f0] text-sm font-semibold text-[#08733f]">
        Loading Veritas…
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (session.role !== role) return <Navigate to={session.path} replace />;
  return children;
}
