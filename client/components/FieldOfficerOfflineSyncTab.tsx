import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function FieldOfficerOfflineSyncTab() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    const apply = () => {
      if (cancelled) return;
      const elements = Array.from(document.querySelectorAll<HTMLElement>("button, a, p, span"));

      elements.forEach((element) => {
        const text = element.textContent?.trim();

        if (text === "Draft Reports") {
          element.textContent = "Offline Sync";
          if (element.closest("nav") || element.closest("aside")) {
            const clickable = element.closest<HTMLElement>("button, a") ?? element;
            clickable.onclick = (event) => {
              event.preventDefault();
              event.stopPropagation();
              navigate("/field-officer/sync");
            };
          }
        }

        if (text === "Sync Queue") {
          const clickable = element.closest<HTMLElement>("button, a");
          if (clickable && (clickable.closest("nav") || clickable.closest("aside"))) {
            clickable.style.display = "none";
          }
        }

        if (text === "Sync Queue" && location.pathname === "/field-officer/sync") {
          element.textContent = "Offline Sync";
        }

        if (text === "Draft Reports" && !element.closest("nav") && !element.closest("aside")) {
          element.textContent = "Offline Saved";
        }
      });

      if (location.pathname === "/field-officer/drafts") {
        navigate("/field-officer/sync", { replace: true });
      }
    };

    apply();
    observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [location.pathname, navigate]);

  return null;
}
