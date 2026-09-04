import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import ConsultantOperationsMap from "./ConsultantOperationsMap";

function sectionByHeading(text: string) {
  return Array.from(document.querySelectorAll("h2")).find(
    (heading) => heading.textContent?.trim() === text,
  )?.closest("section") as HTMLElement | null;
}

export default function ConsultantOperationsPortal() {
  const location = useLocation();
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (location.pathname !== "/consultant-admin") {
      setHost(null);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let previousMapSection: HTMLElement | null = null;
    let previousContractorSection: HTMLElement | null = null;
    let portalHost: HTMLElement | null = null;

    const attach = () => {
      if (cancelled) return;
      const mapSection = sectionByHeading("Interactive Project Map");
      const contractorSection = sectionByHeading("Contractor Performance");

      if (!mapSection) {
        attempts += 1;
        if (attempts < 30) window.setTimeout(attach, 80);
        return;
      }

      previousMapSection = mapSection;
      previousContractorSection = contractorSection;
      mapSection.style.display = "none";
      if (contractorSection) contractorSection.style.display = "none";

      portalHost = document.createElement("div");
      portalHost.dataset.consultantOperationsHost = "true";
      mapSection.parentElement?.insertBefore(portalHost, mapSection);
      setHost(portalHost);
    };

    attach();

    return () => {
      cancelled = true;
      setHost(null);
      if (previousMapSection) previousMapSection.style.display = "";
      if (previousContractorSection) previousContractorSection.style.display = "";
      portalHost?.remove();
    };
  }, [location.pathname]);

  if (!host) return null;
  return createPortal(<ConsultantOperationsMap />, host);
}
