import { useState } from "react";
import { BarChart3, FileCheck2, UsersRound, Activity } from "lucide-react";
import ReaAnalyticsDashboard from "./ReaAnalyticsDashboard";
import ReaReportsManagement from "./ReaReportsManagement";
import ReaUserManagement from "./ReaUserManagement";
import ReaAuditTrail from "./ReaAuditTrail";

type Props = { portfolioProjects: any[] };

const sections = [
  { key: "Analytics", label: "Analytics", icon: BarChart3 },
  { key: "Reports", label: "Reports", icon: FileCheck2 },
  { key: "Users", label: "Users", icon: UsersRound },
  { key: "Audit Trail", label: "Audit Trail", icon: Activity },
] as const;

export default function ReaAdministration({ portfolioProjects }: Props) {
  const [active, setActive] = useState<(typeof sections)[number]["key"]>("Analytics");

  return (
    <div className="space-y-4 pb-8 pt-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f5ec] text-[#08733f]">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#173b2a]">Administration</h2>
            <p className="mt-1 text-xs text-slate-500">
              Manage users, audit activity, reports and portfolio analytics from one administration area.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-1 sm:grid-cols-4">
          {sections.map((item) => {
            const Icon = item.icon;
            const selected = active === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActive(item.key)}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-xs font-bold transition-colors ${
                  selected
                    ? "bg-white text-[#08733f] shadow-sm"
                    : "text-slate-500 hover:bg-white/70 hover:text-[#173b2a]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      {active === "Analytics" ? (
        <ReaAnalyticsDashboard projects={portfolioProjects} />
      ) : active === "Reports" ? (
        <ReaReportsManagement projects={portfolioProjects} />
      ) : active === "Users" ? (
        <ReaUserManagement />
      ) : (
        <ReaAuditTrail />
      )}
    </div>
  );
}
