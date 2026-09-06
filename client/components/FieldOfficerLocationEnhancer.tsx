import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function enhanceFieldOfficerLocationControls() {
  if (!window.location.pathname.startsWith("/field-officer")) return;

  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));

  for (const button of buttons) {
    const label = button.textContent?.replace(/\s+/g, " ").trim() ?? "";

    if (label.includes("Use project coordinates for demo") || label.includes("Demo GPS")) {
      button.textContent = "Demo GPS — use project coordinates";
      button.title =
        "Demo mode: verifies the assignment using its saved project coordinates so the workflow can be tested away from the physical site.";
      button.setAttribute("data-veritas-demo-gps", "true");
      button.className =
        "flex h-11 w-full items-center justify-center gap-2 rounded-md border border-dashed border-[#d8a72d] bg-[#fff8e5] px-4 text-xs font-bold text-[#8a6500] transition hover:bg-[#fff1c7] disabled:cursor-not-allowed disabled:opacity-40";
    }

    if (
      label.includes("Optional: navigate in Google Map") ||
      label.includes("Google Map navigation active") ||
      label.includes("Open Google Maps again")
    ) {
      button.disabled = false;
      button.removeAttribute("disabled");
      if (label.includes("Google Map navigation active")) {
        button.textContent = "Open Google Maps again";
      }
      button.title =
        "Open turn-by-turn directions to the assigned project coordinates in Google Maps.";
      button.setAttribute("data-veritas-google-navigation", "true");
    }
  }
}

export default function FieldOfficerLocationEnhancer() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) return;

    enhanceFieldOfficerLocationControls();
    const observer = new MutationObserver(enhanceFieldOfficerLocationControls);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    return () => observer.disconnect();
  }, [location.pathname]);

  return null;
}
