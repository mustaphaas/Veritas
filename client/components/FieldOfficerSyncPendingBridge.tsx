import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "veritas-field-sync-pending-count";
const EVENT_NAME = "veritas-field-sync-pending-change";

export default function FieldOfficerSyncPendingBridge() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/field-officer/sync") return;

    const publish = () => {
      const heading = Array.from(document.querySelectorAll("h2")).find(
        (node) => node.textContent?.trim() === "Offline Sync Queue",
      );
      const section = heading?.closest("section");
      if (!section) return;

      const getCardValue = (label: string) => {
        const labelNode = Array.from(section.querySelectorAll("p")).find(
          (node) => node.textContent?.trim() === label,
        );
        const card = labelNode?.closest("div.group");
        const valueNode = card
          ? Array.from(card.querySelectorAll("p")).find((node) => /^\d+$/.test(node.textContent?.trim() ?? ""))
          : null;
        return Number(valueNode?.textContent ?? "0");
      };

      const pending = getCardValue("Waiting") + getCardValue("Uploading");
      if (!Number.isFinite(pending)) return;

      localStorage.setItem(STORAGE_KEY, String(pending));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: pending }));
    };

    publish();
    const observer = new MutationObserver(publish);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [location.pathname]);

  return null;
}

export { STORAGE_KEY as FIELD_SYNC_PENDING_KEY, EVENT_NAME as FIELD_SYNC_PENDING_EVENT };
