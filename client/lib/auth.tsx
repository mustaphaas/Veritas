import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { AuthSession, LoginResponse, UserRole } from "@shared/backend";
import { apiRequest, firebasePasswordSignIn } from "./api";

export type DemoRole = UserRole;

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const result = await apiRequest<LoginResponse>("/api/auth/session");
      setSession(result.user);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      login: async (email, password) => {
        const idToken = await firebasePasswordSignIn(email, password);
        const result = await apiRequest<LoginResponse>(
          "/api/auth/session-login",
          {
            method: "POST",
            body: JSON.stringify({ idToken }),
          },
        );
        setSession(result.user);
        return result.user;
      },
      logout: async () => {
        try {
          await apiRequest<{ ok: boolean }>("/api/auth/logout", {
            method: "POST",
          });
        } finally {
          setSession(null);
        }
      },
      refresh,
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
  role: UserRole;
  children: ReactNode;
}) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#eef6f0]">
        <p className="text-sm font-semibold text-[#08733f]">
          Loading secure workspace…
        </p>
      </main>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (session.role !== role) return <Navigate to={session.path} replace />;
  return children;
}
