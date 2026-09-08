import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function FieldOfficerSequentialSyncMountFix() {
  const location = useLocation();

  useEffect(() => {
    const normalizedPath = location.pathname.replace(/\/+$/, "") || "/";
    if (normalizedPath !== "/field-officer/sync") return;

    const normalizeHeading = () => {
      const heading = Array.from(document.querySelectorAll("h2")).find(
        (node) => node.textContent?.trim() === "Offline Sync Queue",
      );
      if (!heading) return false;
      heading.textContent = "Offline Sync";
      return true;
    };

    if (normalizeHeading()) return;

    const observer = new MutationObserver(() => {
      if (normalizeHeading()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location.pathname]);

  return null;
}
