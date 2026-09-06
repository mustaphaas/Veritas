import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCircle2,
  Clock3,
  CloudUpload,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  Signal,
  X,
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
    <div className="veritas-rail-brand flex h-[94px] items-center gap-3 px-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
        <img src="/rea-brand-mark.svg" alt="REA" className="h-11 w-11 object-contain" />
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

const syncQueueDemo = [
  {
    project: "DARES Kaduna Grid Extension",
    id: "REA-KAD-0214",
    location: "Kawo, Kaduna North",
    type: "Inspection report + 8 photos",
    queued: "Today, 8:42 AM",
    size: "18.4 MB",
    state: "Waiting for network",
  },
  {
    project: "NEP Kano Mini Grid",
    id: "REA-KAN-0187",
    location: "Kofar Ruwa, Kano Municipal",
    type: "Inspection report + signatures",
    queued: "Today, 8:18 AM",
    size: "6.7 MB",
    state: "Ready to sync",
  },
  {
    project: "AMP Katsina SAS Verification",
    id: "REA-KAT-0096",
    location: "Kofar Sauri, Katsina",
    type: "GPS record + 5 photos",
    queued: "Yesterday, 5:36 PM",
    size: "12.1 MB",
    state: "Ready to sync",
  },
  {
    project: "NEP Sokoto Mini Grid",
    id: "REA-SOK-0068",
    location: "Gagi, Sokoto South",
    type: "Inspection draft + evidence",
    queued: "Yesterday, 4:11 PM",
    size: "9.8 MB",
    state: "Retry required",
  },
];

function SyncQueueDemo() {
  return (
    <section className="w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-5 border-b border-slate-100 px-5 py-5 sm:px-6 sm:py-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#d4e9db] bg-[#eef8f1] text-[#08733f] shadow-sm">
            <CloudUpload className="h-5 w-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[18px] font-bold tracking-tight text-[#173b2a] sm:text-xl">Offline Sync Queue</h2>
              <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-bold text-slate-600">
                4 records
              </span>
              <span className="inline-flex h-6 items-center rounded-full border border-[#b9dfc5] bg-[#eff9f2] px-2.5 text-[9px] font-bold text-[#08733f]">
                Sequential upload
              </span>
            </div>
            <p className="mt-1.5 max-w-3xl text-[11px] leading-5 text-slate-500 sm:text-xs">
              Field inspection records waiting to upload. Records remain securely stored on the device until synchronization succeeds.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[#08733f] px-4 text-[10px] font-bold text-white shadow-[0_4px_12px_rgba(8,115,63,0.18)] transition hover:bg-[#066535] sm:w-fit"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Sync all records
        </button>
      </div>

      <div className="grid gap-3 border-b border-slate-100 bg-[#f7faf8] p-4 sm:grid-cols-3 sm:p-5 lg:p-6">
        <div className="flex min-h-[108px] items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-[0_3px_12px_rgba(15,23,42,0.035)] sm:px-5">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Queued</p>
            <p className="mt-1 text-[26px] font-bold leading-none text-[#173b2a]">4</p>
            <p className="mt-2 text-[9px] font-medium text-slate-400">46.9 MB pending</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <CloudUpload className="h-4 w-4" />
          </span>
        </div>

        <div className="flex min-h-[108px] items-center justify-between rounded-xl border border-[#b9dfc5] bg-white px-4 py-4 shadow-[0_3px_12px_rgba(15,23,42,0.035)] sm:px-5">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#5e8069]">Ready</p>
            <p className="mt-1 text-[26px] font-bold leading-none text-[#08733f]">2</p>
            <p className="mt-2 text-[9px] font-medium text-[#6e8b76]">Ready to synchronize</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf8f0] text-[#08733f]">
            <CheckCircle2 className="h-4 w-4" />
          </span>
        </div>

        <div className="flex min-h-[108px] items-center justify-between rounded-xl border border-[#f0d88d] bg-white px-4 py-4 shadow-[0_3px_12px_rgba(15,23,42,0.035)] sm:px-5">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8d6a1e]">Attention</p>
            <p className="mt-1 text-[26px] font-bold leading-none text-[#a56c00]">2</p>
            <p className="mt-2 text-[9px] font-medium text-[#8d764c]">Waiting or retry required</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff8e5] text-[#a56c00]">
            <Signal className="h-4 w-4" />
          </span>
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(0,1.45fr)_minmax(250px,.85fr)_240px] items-center gap-8 border-b border-slate-100 bg-slate-50/60 px-6 py-3.5 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400 lg:grid">
        <span>Inspection record</span>
        <span>Package details</span>
        <span className="text-right">Sync status</span>
      </div>

      <div className="divide-y divide-slate-100">
        {syncQueueDemo.map((item) => (
          <article
            key={item.id}
            className="grid gap-4 px-5 py-5 transition-colors hover:bg-[#fbfdfb] sm:px-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(250px,.85fr)_240px] lg:items-center lg:gap-8 lg:py-5"
          >
            <div className="min-w-0">
              <div className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d5eadc] bg-[#edf8f0] text-[#08733f]">
                  <Signal className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold leading-5 text-[#173b2a]">{item.project}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-medium text-slate-500">
                    <span>{item.id}</span>
                    <span className="text-slate-300">•</span>
                    <span>{item.location}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
              <p className="mb-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400 lg:hidden">Package details</p>
              <p className="truncate text-[10px] font-semibold leading-4 text-slate-600">{item.type}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3 w-3 shrink-0" />
                  {item.queued}
                </span>
                <span className="hidden text-slate-300 sm:inline">•</span>
                <span className="font-medium text-slate-500">{item.size}</span>
              </div>
            </div>

            <div className="flex min-w-0 items-center justify-between gap-3 lg:justify-end">
              <div className="min-w-0 lg:text-right">
                <p className="mb-1.5 text-left text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400 lg:hidden">Sync status</p>
                <span
                  className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[9px] font-bold ${
                    item.state === "Ready to sync"
                      ? "border-[#b9dfc5] bg-[#eff9f2] text-[#08733f]"
                      : item.state === "Retry required"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-[#f0d88d] bg-[#fff8e5] text-[#956300]"
                  }`}
                >
                  {item.state}
                </span>
              </div>
              <button
                type="button"
                className="inline-flex h-9 min-w-[70px] shrink-0 items-center justify-center rounded-lg border border-[#9bcfab] bg-white px-3 text-[9px] font-bold text-[#08733f] shadow-sm transition hover:border-[#08733f] hover:bg-[#eff9f2]"
              >
                Sync
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="flex items-start gap-3 border-t border-[#d7e9dc] bg-[#f4faf6] px-5 py-4 sm:px-6">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#08733f] shadow-sm ring-1 ring-[#d5eadc]">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </span>
        <p className="max-w-4xl text-[10px] leading-5 text-[#4d745d]">
          GPS coordinates, timestamps, evidence and signatures stay attached to each inspection package until the upload is completed successfully.
        </p>
      </div>
    </section>
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
  const location = useLocation();
  const { logout } = useAuth();
  const normalizedPath = location.pathname.replace(/\/+$/, "") || "/";
  const showFieldSyncQueue =
    title === "Field Officer Dashboard" &&
    (normalizedPath === "/field-officer/sync" ||
      normalizedPath.startsWith("/field-officer/sync/"));

  const displayedNavigation =
    title === "Field Officer Dashboard"
      ? navigation
          .filter(
            (item) =>
              item.label !== "Inspections" && item.label !== "Draft Reports",
          )
          .map((item) =>
            item.label === "My Assignments"
              ? {
                  ...item,
                  label: "My Inspections",
                  href: "/field-officer/inspections",
                  sourceLabel: "Inspections",
                }
              : { ...item, sourceLabel: item.label },
          )
      : navigation.map((item) => ({ ...item, sourceLabel: item.label }));

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
      <div className="veritas-rail-separator h-px bg-slate-200" />
      <nav className="veritas-rail-nav flex-1 space-y-2 px-3 py-5">
        {displayedNavigation.map(({ label, icon: Icon, href, sourceLabel }) => {
          const active =
            activeNav === sourceLabel ||
            (label === "My Inspections" &&
              (activeNav === "My Assignments" || activeNav === "Inspections"));
          const className = `veritas-rail-link flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors ${active ? "is-active bg-[#edf9f0] text-[#08733f]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`;
          return href ? (
            <Link
              key={label}
              to={href}
              data-label={label}
              aria-label={label}
              onClick={() => {
                setInternalActiveNav(sourceLabel);
                onNavigationChange?.(sourceLabel);
                setMobileMenuOpen(false);
              }}
              className={className}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.5 : 1.8} />
              <span>{label}</span>
            </Link>
          ) : (
            <button
              key={label}
              type="button"
              data-label={label}
              aria-label={label}
              onClick={() => {
                setInternalActiveNav(sourceLabel);
                onNavigationChange?.(sourceLabel);
                setMobileMenuOpen(false);
              }}
              className={className}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.5 : 1.8} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      <div className="veritas-rail-footer border-t border-slate-200 p-3">
        <button
          type="button"
          data-label="Settings"
          aria-label="Settings"
          onClick={() => {
            setInternalActiveNav("Settings");
            onNavigationChange?.("Settings");
            setMobileMenuOpen(false);
          }}
          className={`veritas-rail-link flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${activeNav === "Settings" ? "is-active bg-[#edf9f0] text-[#08733f]" : "text-slate-600 hover:bg-slate-50"}`}
        >
          <Settings className="h-[18px] w-[18px]" strokeWidth={activeNav === "Settings" ? 2.5 : 1.8} />
          <span>Settings</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f6f8f6] text-slate-900">
      <aside className="veritas-side-rail fixed inset-y-0 left-0 z-30 hidden w-[58px] flex-col border-r border-slate-200 bg-white lg:flex">
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

      <main className="lg:pl-[72px]">
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
          {showFieldSyncQueue ? <SyncQueueDemo key={normalizedPath} /> : children}
        </div>
      </main>
    </div>
  );
}
