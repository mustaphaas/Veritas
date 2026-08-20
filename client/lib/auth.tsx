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

type ApiUser = {
  id: string;
  email: string;
  displayName: string;
  role: DemoRole;
};

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthSession | null>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function sessionFromUser(user: ApiUser): AuthSession {
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
    id: user.id,
    role: user.role,
    roleLabel: labels[user.role],
    name: user.displayName,
    initials: user.displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(""),
    email: user.email,
    path: paths[user.role],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as {
          authenticated?: boolean;
          user?: ApiUser | null;
        };
        return body.authenticated && body.user ? sessionFromUser(body.user) : null;
      })
      .catch(() => null)
      .then((nextSession) => {
        if (active) {
          setSession(nextSession);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { user?: ApiUser };
      if (!body.user) return null;
      const nextSession = sessionFromUser(body.user);
      setSession(nextSession);
      return nextSession;
    } catch {
      return null;
    }
  };

  const logout = () => {
    void fetch("/api/auth/session", {
      method: "DELETE",
      credentials: "same-origin",
    }).catch(() => undefined);
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
        Securing session…
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (session.role !== role) return <Navigate to={session.path} replace />;
  return children;
}
