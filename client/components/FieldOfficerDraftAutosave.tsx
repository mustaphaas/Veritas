import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function hideDraftsOutsideDraftWorkspace(pathname: string) {
  if (pathname === "/field-officer/drafts") return;

  const hideDraftRowsInSection = (section: Element | null) => {
    if (!section) return;
    const candidates = Array.from(
      section.querySelectorAll<HTMLElement>("button, article, div.grid"),
    );
    candidates.forEach((row) => {
      const draftPill = Array.from(row.querySelectorAll("span")).some(
        (span) => span.textContent?.trim() === "Draft",
      );
      if (draftPill) row.style.display = "none";
    });
  };

  if (pathname === "/field-officer/inspections") {
    const heading = Array.from(document.querySelectorAll("h2")).find(
      (node) => node.textContent?.trim() === "Inspections",
    );
    hideDraftRowsInSection(heading?.closest("section") ?? null);
  }

  if (pathname === "/field-officer") {
    const assignedHeading = Array.from(document.querySelectorAll("h2")).find(
      (node) => node.textContent?.trim() === "Assigned projects",
    );
    hideDraftRowsInSection(assignedHeading?.closest("section") ?? null);
  }
}

function simplifyOverviewConnectivityStatus(pathname: string) {
  if (pathname !== "/field-officer") return;

  const spans = Array.from(document.querySelectorAll<HTMLElement>("span"));
  const status = spans.find((element) => {
    const text = element.textContent?.trim() ?? "";
    return (
      text.includes("Online · field data sync is active") ||
      text.includes("Offline · drafts and evidence will remain on this device")
    );
  });

  if (!status) return;
  const text = status.textContent?.trim() ?? "";
  status.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) node.textContent = "";
  });
  status.append(document.createTextNode(text.startsWith("Online") ? "Online" : "Offline"));

  const section = status.closest("section");
  const syncButton = section?.querySelector<HTMLButtonElement>("button");
  if (syncButton) syncButton.style.display = "none";
}

export default function FieldOfficerDraftAutosave() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) return;
    const apply = () => {
      hideDraftsOutsideDraftWorkspace(location.pathname);
      simplifyOverviewConnectivityStatus(location.pathname);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location.pathname]);

  return null;
}
