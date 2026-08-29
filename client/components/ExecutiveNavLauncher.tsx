import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Presentation } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ExecutiveNavLauncher() {
  const navigate = useNavigate();
  const [hosts, setHosts] = useState<HTMLElement[]>([]);

  useEffect(() => {
    const syncHosts = () => {
      const next = Array.from(document.querySelectorAll<HTMLElement>("aside nav"));
      setHosts((current) => {
        if (current.length === next.length && current.every((host, index) => host === next[index])) {
          return current;
        }
        return next;
      });
    };

    syncHosts();
    const observer = new MutationObserver(syncHosts);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {hosts.map((host, index) =>
        createPortal(
          <button
            type="button"
            onClick={() => navigate("/executive")}
            className="group mt-3 flex w-full items-center gap-3 rounded-md border border-[#cfe6d6] bg-gradient-to-r from-[#eef9f1] to-white px-3 py-2.5 text-left text-sm font-semibold text-[#08733f] transition-all hover:border-[#9bcbaa] hover:bg-[#e9f7ed] hover:shadow-sm"
            aria-label="Open MD Executive Dashboard"
          >
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[#08733f] text-white shadow-sm transition-transform group-hover:scale-105">
              <Presentation className="h-3.5 w-3.5" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">Executive Dashboard</span>
            <span className="rounded-full bg-[#08733f]/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-[#08733f]">MD</span>
          </button>,
          host,
          `executive-nav-${index}`,
        ),
      )}
    </>
  );
}
