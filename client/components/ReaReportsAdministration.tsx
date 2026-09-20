import { useState } from "react";
import { BarChart3, FileCheck2 } from "lucide-react";
import ReaAnalyticsDashboard from "./ReaAnalyticsDashboard";
import ReaReportsManagement from "./ReaReportsManagement";

type Props = { portfolioProjects: any[] };

export default function ReaReportsAdministration({ portfolioProjects }: Props) {
  const [active, setActive] = useState<"Reports" | "Analytics">("Reports");

  return (
    <div className="space-y-4 pb-8 pt-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-[#173b2a]">Reports</h2>
        <p className="mt-1 text-xs text-slate-500">Access programme reports and portfolio analytics from one place.</p>
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-1">
          <button type="button" onClick={() => setActive("Reports")} className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-xs font-bold ${active === "Reports" ? "bg-white text-[#08733f] shadow-sm" : "text-slate-500"}`}>
            <FileCheck2 className="h-4 w-4" /> Reports
          </button>
          <button type="button" onClick={() => setActive("Analytics")} className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-xs font-bold ${active === "Analytics" ? "bg-white text-[#08733f] shadow-sm" : "text-slate-500"}`}>
            <BarChart3 className="h-4 w-4" /> Analytics
          </button>
        </div>
      </section>
      {active === "Reports" ? <ReaReportsManagement projects={portfolioProjects} /> : <ReaAnalyticsDashboard projects={portfolioProjects} />}
    </div>
  );
}
