import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  LogOut,
  Menu,
  Settings,
  UsersRound,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../lib/auth";

export type RoleNavigationItem = {
  label: string;
  icon: LucideIcon;
  href?: string;
};

type RoleDashboardShellProps = {
  title: string;
  subtitle: string;
  roleName: string;
  initials: string;
  navigation: RoleNavigationItem[];
  activeNavigation?: string;
  onNavigationChange?: (label: string) => void;
  children: ReactNode;
};

function ReaBrand() {
  return (
    <div className="flex h-[94px] items-center gap-3 px-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[3px] border-[#08733f] text-[#08733f]">
        <Zap className="h-7 w-7" fill="#e7f7ec" strokeWidth={2.5} />
      </div>
      <div>
        <p className="text-xl font-bold tracking-tight text-[#153b28]">REA</p>
        <p className="mt-0.5 text-[7px] font-bold leading-[9px] text-[#173b2a]">
          RURAL ELECTRIFICATION
          <br />
          AGENCY
        </p>
      </div>
    </div>
  );
}

export default function RoleDashboardShell({
  title,
  subtitle,
  roleName,
  initials,
  navigation,
  activeNavigation,
  onNavigationChange,
  children,
}: RoleDashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [internalActiveNav, setInternalActiveNav] = useState("Overview");
  const activeNav = activeNavigation ?? internalActiveNav;
  const navigate = useNavigate();
  const { logout } = useAuth();

  const navContent = (
    <>
      <button
        type="button"
        className="w-full text-left"
        aria-label="Open dashboard overview"
        onClick={() => {
          setInternalActiveNav("Overview");
          onNavigationChange?.("Overview");
          setMobileMenuOpen(false);
        }}
      >
        <ReaBrand />
      </button>
      <div className="h-px bg-slate-200" />
      <nav className="flex-1 space-y-2 px-3 py-5">
        {navigation.map(({ label, icon: Icon, href }) => {
          const active = activeNav === label;
          const className = `flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors ${active ? "bg-[#edf9f0] text-[#08733f]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`;
          return href ? (
            <Link
              key={label}
              to={href}
              onClick={() => {
                setInternalActiveNav(label);
                onNavigationChange?.(label);
                setMobileMenuOpen(false);
              }}
              className={className}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          ) : (
            <button
              key={label}
              type="button"
              onClick={() => {
                setInternalActiveNav(label);
                onNavigationChange?.(label);
                setMobileMenuOpen(false);
              }}
              className={className}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <button
          type="button"
          onClick={() => {
            setInternalActiveNav("Settings");
            onNavigationChange?.("Settings");
            setMobileMenuOpen(false);
          }}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${activeNav === "Settings" ? "bg-[#edf9f0] text-[#08733f]" : "text-slate-600 hover:bg-slate-50"}`}
        >
          <Settings className="h-[18px] w-[18px]" /> Settings
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f6f8f6] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[190px] flex-col border-r border-slate-200 bg-white lg:flex">
        {navContent}
      </aside>
      <div
        className={`fixed inset-0 z-50 lg:hidden ${mobileMenuOpen ? "" : "pointer-events-none"}`}
      >
        <button
          type="button"
          aria-label="Close navigation backdrop"
          onClick={() => setMobileMenuOpen(false)}
          className={`absolute inset-0 bg-slate-900/20 transition-opacity ${mobileMenuOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl transition-transform ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute right-3 top-4 rounded p-2 text-slate-500"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
          {navContent}
        </aside>
      </div>

      <main className="lg:pl-[190px]">
        <header className="sticky top-0 z-20 flex h-[94px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-[#142a1f] sm:text-[22px]">
                {title}
              </h1>
              <p className="mt-1 hidden truncate text-xs text-slate-500 sm:block">
                {subtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-2 text-xs font-semibold text-[#08733f] md:flex">
              <i className="h-2 w-2 rounded-full bg-[#16a05a]" /> Live data
            </span>
            <button
              type="button"
              onClick={() => {
                setInternalActiveNav("Notifications");
                onNavigationChange?.("Notifications");
              }}
              className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-[#df7d00] px-1 text-[8px] font-bold text-white">
                3
              </span>
            </button>
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e9f5ec] text-xs font-bold text-[#08733f]">
                {initials}
              </div>
              <span className="hidden text-xs font-semibold text-[#142a1f] xl:block">
                {roleName}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
              className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 hover:border-[#e2b5b5] hover:bg-red-50 hover:text-red-700"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden xl:inline">Logout</span>
            </button>
          </div>
        </header>
        <div className="mx-auto max-w-[1580px] px-4 py-4 sm:px-7">
          {children}
        </div>
      </main>
    </div>
  );
}
