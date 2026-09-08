import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const blockedDistancePattern =
  /Verification blocked — you are ([\d,]+(?:\.\d+)?) m outside the project centre\./;

export default function FieldOfficerGpsKmDisplay() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) return;

    const updateDistance = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();

      while (node) {
        const text = node.textContent ?? "";
        const match = text.match(blockedDistancePattern);
        if (match) {
          const metres = Number(match[1].replace(/,/g, ""));
          if (Number.isFinite(metres)) {
            const kilometres = metres / 1000;
            node.textContent = text.replace(
              blockedDistancePattern,
              `Verification blocked — you are ${kilometres.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} km outside the project centre.`,
            );
          }
        }
        node = walker.nextNode();
      }
    };

    updateDistance();
    const observer = new MutationObserver(updateDistance);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [location.pathname]);

  return null;
}
