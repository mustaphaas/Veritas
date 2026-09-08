import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function FieldOfficerSyncMediaMock() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/field-officer/sync") return;

    const apply = () => {
      Array.from(document.querySelectorAll("article p")).forEach((node) => {
        const text = node.textContent?.trim() ?? "";
        if (text.startsWith("Inspection report +")) {
          node.textContent = "Inspection report + 8 media";
        }
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [location.pathname]);

  return null;
}
