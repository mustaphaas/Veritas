import { useEffect } from "react";

const FULLSCREEN_BUTTON_ID = "veritas-project-map-fullscreen";

function setButtonState(button: HTMLButtonElement, active: boolean) {
  button.setAttribute("aria-label", active ? "Exit full screen" : "Show full screen");
  button.title = active ? "Exit Full Screen" : "Show Full Screen";
  button.innerHTML = active
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg><span class="hidden xl:inline">Exit Full Screen</span>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg><span class="hidden xl:inline">Full Screen</span>';
}

function findMapRoot(toolbar: HTMLElement) {
  return toolbar.closest(".fixed.bottom-0.left-0.right-0") as HTMLElement | null;
}

function setFallbackFullscreen(root: HTMLElement, active: boolean) {
  if (active) {
    if (root.dataset.veritasFallbackFullscreen === "true") return;
    root.dataset.veritasFallbackFullscreen = "true";
    root.dataset.veritasPrevTop = root.style.top;
    root.dataset.veritasPrevLeft = root.style.left;
    root.dataset.veritasPrevZ = root.style.zIndex;
    root.style.top = "0";
    root.style.left = "0";
    root.style.zIndex = "90";
  } else if (root.dataset.veritasFallbackFullscreen === "true") {
    root.style.top = root.dataset.veritasPrevTop ?? "";
    root.style.left = root.dataset.veritasPrevLeft ?? "";
    root.style.zIndex = root.dataset.veritasPrevZ ?? "";
    delete root.dataset.veritasFallbackFullscreen;
    delete root.dataset.veritasPrevTop;
    delete root.dataset.veritasPrevLeft;
    delete root.dataset.veritasPrevZ;
  }
}

export default function ProjectMapFullscreenEnhancer() {
  useEffect(() => {
    const attach = () => {
      const zoomIn = document.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
      const toolbar = zoomIn?.parentElement;
      if (!toolbar || document.getElementById(FULLSCREEN_BUTTON_ID)) return;

      const button = document.createElement("button");
      button.id = FULLSCREEN_BUTTON_ID;
      button.type = "button";
      button.className =
        "flex items-center gap-1.5 border-l border-slate-200 px-2.5 py-2 text-[9px] font-extrabold text-slate-600 transition hover:bg-slate-50 hover:text-[#128149]";
      setButtonState(button, false);

      button.addEventListener("click", async () => {
        const root = findMapRoot(toolbar);
        if (!root) return;

        const nativeActive = document.fullscreenElement === root;
        const fallbackActive = root.dataset.veritasFallbackFullscreen === "true";
        const active = nativeActive || fallbackActive;

        if (active) {
          if (nativeActive) {
            await document.exitFullscreen?.().catch(() => undefined);
          }
          setFallbackFullscreen(root, false);
          setButtonState(button, false);
          return;
        }

        if (root.requestFullscreen) {
          try {
            await root.requestFullscreen();
            setButtonState(button, true);
            return;
          } catch {
            // Some embedded browsers block the native API; use the CSS fallback.
          }
        }

        setFallbackFullscreen(root, true);
        setButtonState(button, true);
      });

      toolbar.appendChild(button);
    };

    const syncFullscreenState = () => {
      const button = document.getElementById(FULLSCREEN_BUTTON_ID) as HTMLButtonElement | null;
      if (!button) return;
      const toolbar = button.parentElement;
      const root = toolbar ? findMapRoot(toolbar) : null;
      const active = !!root &&
        (document.fullscreenElement === root || root.dataset.veritasFallbackFullscreen === "true");
      setButtonState(button, active);
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("fullscreenchange", syncFullscreenState);

    return () => {
      observer.disconnect();
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      const button = document.getElementById(FULLSCREEN_BUTTON_ID);
      const toolbar = button?.parentElement;
      const root = toolbar ? findMapRoot(toolbar) : null;
      if (root) setFallbackFullscreen(root, false);
      button?.remove();
    };
  }, []);

  return null;
}
