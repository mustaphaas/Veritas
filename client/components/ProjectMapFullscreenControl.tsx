import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

function getProjectMapRoot() {
  const marker = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Open project map panel"]',
  );
  return marker?.closest(".fixed.bottom-0.left-0.right-0") as HTMLElement | null;
}

export default function ProjectMapFullscreenControl() {
  const [mapVisible, setMapVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const sync = () => setMapVisible(Boolean(getProjectMapRoot()));
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (mapVisible) return;
    setExpanded(false);
  }, [mapVisible]);

  const toggle = () => {
    const root = getProjectMapRoot();
    if (!root) return;

    if (!expanded) {
      root.dataset.veritasPrevTop = root.style.top;
      root.dataset.veritasPrevLeft = root.style.left;
      root.dataset.veritasPrevZ = root.style.zIndex;
      root.style.top = "0";
      root.style.left = "0";
      root.style.zIndex = "90";
      setExpanded(true);
      return;
    }

    root.style.top = root.dataset.veritasPrevTop ?? "";
    root.style.left = root.dataset.veritasPrevLeft ?? "";
    root.style.zIndex = root.dataset.veritasPrevZ ?? "";
    delete root.dataset.veritasPrevTop;
    delete root.dataset.veritasPrevLeft;
    delete root.dataset.veritasPrevZ;
    setExpanded(false);
  };

  if (!mapVisible) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className="fixed bottom-8 right-8 z-[100] flex h-10 items-center gap-2 rounded-lg border border-[#c9d8cf] bg-white/95 px-3.5 text-[9px] font-extrabold text-slate-700 shadow-[0_8px_24px_rgba(26,55,40,0.14)] backdrop-blur transition hover:-translate-y-0.5 hover:border-[#85b695] hover:text-[#128149]"
      aria-label={expanded ? "Exit full screen map" : "Show full screen map"}
      title={expanded ? "Exit Full Screen" : "Show Full Screen"}
    >
      {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      <span>{expanded ? "Exit Full Screen" : "Full Screen"}</span>
    </button>
  );
}
