import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UsersRound,
  Zap,
} from "lucide-react";
import { demoAccounts, useAuth } from "../lib/auth";

export default function Login() {
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(demoAccounts[0].email);
  const [password, setPassword] = useState(demoAccounts[0].password);
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [selectedRole, setSelectedRole] = useState(demoAccounts[0].role);

  useEffect(() => setError(""), [email, password]);
  if (session) return <Navigate to={session.path} replace />;

  const selectAccount = (account: (typeof demoAccounts)[number]) => {
    setSelectedRole(account.role);
    setEmail(account.email);
    setPassword(account.password);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSigningIn(true);
    const nextSession = await login(email, password);
    setSigningIn(false);
    if (!nextSession) {
      setError("The email or password does not match a demo account.");
      return;
    }
    navigate(nextSession.path, { replace: true });
  };

  return (
    <main className="min-h-screen bg-[#eef6f0] p-4 sm:p-7">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1180px] overflow-hidden rounded-2xl border border-[#cfe4d5] bg-white shadow-[0_24px_70px_rgba(11,70,40,0.12)] lg:grid-cols-[1.05fr_.95fr] sm:min-h-[calc(100vh-3.5rem)]">
        <section className="relative hidden overflow-hidden bg-[#075c33] p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[50px] border-white/5" />
          <div className="absolute -bottom-36 -left-28 h-96 w-96 rounded-full border-[70px] border-[#55b979]/15" />
          <div className="relative">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-white">
                <Zap className="h-9 w-9" fill="rgba(255,255,255,.15)" />
              </div>
              <div>
                <p className="text-3xl font-bold tracking-tight">REA</p>
                <p className="mt-1 text-[10px] font-semibold tracking-[0.1em] text-white/75">
                  RURAL ELECTRIFICATION AGENCY
                </p>
              </div>
            </div>
            <h1 className="mt-16 max-w-md text-4xl font-bold leading-tight">
              National project monitoring, from the field to final assurance.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/70">
              One secure workspace for REA administrators, consultant teams and
              field officers delivering reliable power across Nigeria.
            </p>
          </div>
          <div className="relative grid grid-cols-3 gap-3">
            {[
              "National oversight",
              "Field verification",
              "Consultant assurance",
            ].map((label) => (
              <div
                key={label}
                className="rounded-lg border border-white/15 bg-white/10 p-3 backdrop-blur"
              >
                <CheckCircle2 className="h-4 w-4 text-[#8ce3aa]" />
                <p className="mt-2 text-[10px] font-semibold text-white/90">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-10 lg:p-12">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-[#08733f] text-[#08733f]">
                <Zap className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xl font-bold text-[#153b28]">REA</p>
                <p className="text-[8px] font-bold text-slate-500">
                  RURAL ELECTRIFICATION AGENCY
                </p>
              </div>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#08733f]">
              REA Monitoring Platform
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#142a1f]">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Select a demo account or enter its credentials.
            </p>

            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              {demoAccounts.map((account) => {
                const Icon = account.role === "rea" ? ShieldCheck : UsersRound;
                const selected = selectedRole === account.role;
                return (
                  <button
                    key={account.role}
                    type="button"
                    onClick={() => selectAccount(account)}
                    className={`rounded-lg border p-3 text-left transition-colors ${selected ? "border-[#08733f] bg-[#edf8f0]" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  >
                    <Icon
                      className={`h-5 w-5 ${selected ? "text-[#08733f]" : "text-slate-400"}`}
                    />
                    <p className="mt-2 text-[10px] font-bold text-[#173b2a]">
                      {account.roleLabel}
                    </p>
                    <p className="mt-1 truncate text-[9px] text-slate-500">
                      {account.name}
                    </p>
                  </button>
                );
              })}
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-[#263c31]">
                  Email address
                </span>
                <div className="relative mt-1.5">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 pl-10 pr-3 text-sm text-[#173b2a] outline-none focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10"
                    required
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-[#263c31]">
                  Password
                </span>
                <div className="relative mt-1.5">
                  <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 pl-10 pr-10 text-sm text-[#173b2a] outline-none focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-2.5 top-2.5 rounded p-0.5 text-slate-400"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>
              {error && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={signingIn}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#08733f] text-sm font-bold text-white shadow-sm hover:bg-[#065d32] disabled:cursor-wait disabled:opacity-70"
              >
                {signingIn ? "Securing session…" : "Sign in to dashboard"}{" "}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <div className="mt-6 rounded-lg border border-[#d6e9da] bg-[#f7fcf8] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#08733f]">
                Selected demo credentials
              </p>
              <p className="mt-2 break-all font-mono text-[10px] text-slate-600">
                {email}
              </p>
              <p className="mt-1 font-mono text-[10px] text-slate-600">
                {password}
              </p>
            </div>
            <p className="mt-5 text-center text-[10px] text-slate-400">
              Demo access only · No production authentication
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
