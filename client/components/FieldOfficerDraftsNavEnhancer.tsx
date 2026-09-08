import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function FieldOfficerDraftsNavEnhancer() {
  const location = useLocation();

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

  return null;
}
