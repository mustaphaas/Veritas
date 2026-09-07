import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import FieldOfficerSyncQueue from "./FieldOfficerSyncQueue";

export default function FieldOfficerSyncQueueMount() {
  const location = useLocation();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (location.pathname !== "/field-officer/sync") {
      setTarget(null);
      return;
    }

    let cancelled = false;
    let observer: MutationObserver | null = null;
    let mount: HTMLDivElement | null = null;
    let hiddenSection: HTMLElement | null = null;

    const attach = () => {
      if (cancelled) return false;

      const headings = Array.from(document.querySelectorAll("h2"));
      const heading = headings.find((node) =>
        ["Offline Sync Queue", "Offline Sync", "Sync Queue"].includes(
          node.textContent?.trim() ?? "",
        ),
      );
      const section = heading?.closest("section") as HTMLElement | null;
      if (!section?.parentElement) return false;

      const existing = section.parentElement.querySelector<HTMLDivElement>(
        "[data-field-officer-sequential-sync]",
      );
      if (existing) {
        setTarget(existing);
        return true;
      }

      hiddenSection = section;
      hiddenSection.style.display = "none";

      mount = document.createElement("div");
      mount.dataset.fieldOfficerSequentialSync = "true";
      section.parentElement.insertBefore(mount, section.nextSibling);
      setTarget(mount);
      return true;
    };

    if (!attach()) {
      observer = new MutationObserver(() => {
        if (attach()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      mount?.remove();
      if (hiddenSection) hiddenSection.style.display = "";
      setTarget(null);
    };
  }, [location.pathname]);

  if (!target) return null;
  return createPortal(<FieldOfficerSyncQueue />, target);
}
