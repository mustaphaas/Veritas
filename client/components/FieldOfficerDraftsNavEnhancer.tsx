import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FileEdit } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

export default function FieldOfficerDraftsNavEnhancer() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) return;

    const hideDraftRowsFromInspections = () => {
      if (location.pathname !== "/field-officer/inspections") return;

      const headings = Array.from(document.querySelectorAll("h2"));
      const heading = headings.find(
        (node) => node.textContent?.trim() === "Inspections",
      );
      const section = heading?.closest("section");
      if (!section) return;

      const candidateRows = Array.from(
        section.querySelectorAll<HTMLElement>("div.grid"),
      );
      candidateRows.forEach((row) => {
        const pills = Array.from(row.querySelectorAll("span"));
        const isDraft = pills.some(
          (pill) => pill.textContent?.trim() === "Draft",
        );
        if (isDraft) row.style.display = "none";
      });
    };

    hideDraftRowsFromInspections();
    const observer = new MutationObserver(hideDraftRowsFromInspections);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location.pathname]);

  if (!location.pathname.startsWith("/field-officer")) return null;

  const navs = Array.from(
    document.querySelectorAll<HTMLElement>(".veritas-rail-nav"),
  );
  if (!navs.length) return null;

  return (
    <>
      {navs.map((nav, index) =>
        createPortal(
          <button
            key={index}
            type="button"
            data-label="Drafts"
            aria-label="Drafts"
            onClick={() => navigate("/field-officer/drafts")}
            className={`veritas-rail-link flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              location.pathname === "/field-officer/drafts"
                ? "is-active bg-[#edf9f0] text-[#08733f]"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <FileEdit
              className="h-[18px] w-[18px]"
              strokeWidth={
                location.pathname === "/field-officer/drafts" ? 2.5 : 1.8
              }
            />
            <span>Drafts</span>
          </button>,
          nav,
        ),
      )}
    </>
  );
}
