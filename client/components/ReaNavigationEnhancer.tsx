import { useEffect, useState } from "react";
import { X } from "lucide-react";
import ReaAnalyticsDashboard from "./ReaAnalyticsDashboard";
import { projects } from "../lib/dashboard-data";

export default function ReaNavigationEnhancer() {
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  useEffect(() => {
    const syncNavigation = () => {
      document.querySelectorAll("nav button").forEach((button) => {
        const label = button.textContent?.trim();
        if (label === "Projects") {
          (button as HTMLElement).style.display = "none";
        }
        if (label === "Inspections") {
          const textNodes = Array.from(button.childNodes).filter(
            (node) => node.nodeType === Node.TEXT_NODE,
          );
          textNodes.forEach((node) => {
            if (node.textContent?.includes("Inspections")) node.textContent = " Claims";
          });
          button.setAttribute("aria-label", "Claims");
        }
      });
    };

    const handleClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest("nav button");
      if (!button) return;
      const label = button.textContent?.trim();
      if (label === "Analytics") setAnalyticsOpen(true);
      else if (label) setAnalyticsOpen(false);
    };

    syncNavigation();
    const observer = new MutationObserver(syncNavigation);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", handleClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  if (!analyticsOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 top-[94px] z-[19] overflow-y-auto bg-[#f6f8f6] lg:left-[190px]">
      <div className="mx-auto max-w-[1580px] px-4 sm:px-7 lg:px-7">
        <div className="sticky top-0 z-20 flex justify-end bg-[#f6f8f6]/90 pb-1 pt-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setAnalyticsOpen(false)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:border-[#b8dfc5] hover:text-[#08733f]"
          >
            <X className="h-4 w-4" /> Close analytics
          </button>
        </div>
        <ReaAnalyticsDashboard projects={projects} />
      </div>
    </div>
  );
}
