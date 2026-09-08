import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

function isDraftSaveButton(element: Element | null) {
  if (!(element instanceof HTMLButtonElement)) return false;
  const text = element.textContent?.trim().toLowerCase() ?? "";
  return text === "save draft" || text === "save offline draft";
}

function findVisibleDraftSaveButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) =>
      isDraftSaveButton(button) &&
      !button.disabled &&
      button.offsetParent !== null,
  );
}

function hideDraftsOutsideDraftWorkspace(pathname: string) {
  if (pathname === "/field-officer/drafts") return;

  const hideDraftRowsInSection = (section: Element | null) => {
    if (!section) return;
    const candidates = Array.from(
      section.querySelectorAll<HTMLElement>("button, article, div.grid"),
    );
    candidates.forEach((row) => {
      const draftPill = Array.from(row.querySelectorAll("span")).some(
        (span) => span.textContent?.trim() === "Draft",
      );
      if (draftPill) row.style.display = "none";
    });
  };

  if (pathname === "/field-officer/inspections") {
    const heading = Array.from(document.querySelectorAll("h2")).find(
      (node) => node.textContent?.trim() === "Inspections",
    );
    hideDraftRowsInSection(heading?.closest("section") ?? null);
  }

  if (pathname === "/field-officer") {
    const assignedHeading = Array.from(document.querySelectorAll("h2")).find(
      (node) => node.textContent?.trim() === "Assigned projects",
    );
    hideDraftRowsInSection(assignedHeading?.closest("section") ?? null);
  }
}

function simplifyOverviewConnectivityStatus(pathname: string) {
  if (pathname !== "/field-officer") return;

  const spans = Array.from(document.querySelectorAll<HTMLElement>("span"));
  const status = spans.find((element) => {
    const text = element.textContent?.trim() ?? "";
    return (
      text.includes("Online · field data sync is active") ||
      text.includes("Offline · drafts and evidence will remain on this device")
    );
  });

  if (!status) return;
  const text = status.textContent?.trim() ?? "";
  status.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) node.textContent = "";
  });
  status.append(document.createTextNode(text.startsWith("Online") ? "Online" : "Offline"));

  const section = status.closest("section");
  const syncButton = section?.querySelector<HTMLButtonElement>("button");
  if (syncButton) syncButton.style.display = "none";
}

export default function FieldOfficerDraftAutosave() {
  const location = useLocation();
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) return;

    const scheduleSave = () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const button = findVisibleDraftSaveButton();
        button?.click();
      }, 80);
    };

    const shouldAutosave = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      if (!target.closest(".fixed.inset-0")) return false;
      if (target.closest("button") && isDraftSaveButton(target.closest("button"))) {
        return false;
      }
      return Boolean(
        target.closest("input, select, textarea, canvas, label, button"),
      );
    };

    const onInput = (event: Event) => {
      if (shouldAutosave(event.target)) scheduleSave();
    };
    const onChange = (event: Event) => {
      if (shouldAutosave(event.target)) scheduleSave();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (shouldAutosave(event.target)) scheduleSave();
    };

    const flushDraft = () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      findVisibleDraftSaveButton()?.click();
    };

    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pagehide", flushDraft);
    window.addEventListener("beforeunload", flushDraft);

    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pagehide", flushDraft);
      window.removeEventListener("beforeunload", flushDraft);
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) return;
    const apply = () => {
      hideDraftsOutsideDraftWorkspace(location.pathname);
      simplifyOverviewConnectivityStatus(location.pathname);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location.pathname]);

  return null;
}
