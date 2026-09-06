import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  canVerifyArrival,
  distanceMeters,
  isArrivalFresh,
  useInspectionWorkflow,
  type InspectionAssignment,
} from "../lib/inspection-workflow";

type BrowserWindow = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

type GpsFix = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

let arrivalAudioContext: AudioContext | null = null;

function getArrivalAudioContext() {
  const AudioContextClass =
    window.AudioContext || (window as BrowserWindow).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!arrivalAudioContext || arrivalAudioContext.state === "closed") {
    arrivalAudioContext = new AudioContextClass();
  }
  return arrivalAudioContext;
}

async function unlockArrivalAudio() {
  try {
    const context = getArrivalAudioContext();
    if (context?.state === "suspended") await context.resume();
  } catch {
    // Audio remains optional if the browser or device blocks it.
  }
}

async function playArrivalConfirmation() {
  try {
    const context = getArrivalAudioContext();
    if (context) {
      if (context.state === "suspended") await context.resume();

      const now = context.currentTime;
      const playTone = (frequency: number, start: number, duration: number) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.28, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
      };

      playTone(784, now, 0.22);
      playTone(1046, now + 0.24, 0.32);
    }
  } catch {
    // The visual confirmation still appears if sound cannot be played.
  }

  if ("vibrate" in navigator) navigator.vibrate(140);
}

function showArrivalConfirmation(projectName: string, distance: number) {
  document.querySelector("[data-auto-arrival-toast]")?.remove();
  const toast = document.createElement("div");
  toast.dataset.autoArrivalToast = "true";
  toast.setAttribute("role", "status");
  toast.style.cssText = [
    "position:fixed",
    "right:18px",
    "bottom:18px",
    "z-index:9999",
    "max-width:360px",
    "border:1px solid #9ed5af",
    "border-radius:14px",
    "background:#eff9f2",
    "box-shadow:0 14px 35px rgba(23,59,42,.18)",
    "padding:14px 16px",
    "color:#173b2a",
    "font-family:inherit",
  ].join(";");
  toast.innerHTML = `<strong style="display:block;font-size:12px;color:#08733f">Arrival verified</strong><span style="display:block;margin-top:4px;font-size:10px;line-height:1.5">${projectName} · ${distance} m from the approved project centre.</span>`;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 5000);
}

function showGpsStatus(message: string, tone: "info" | "error" = "info") {
  document.querySelector("[data-gps-fix-status]")?.remove();
  const toast = document.createElement("div");
  toast.dataset.gpsFixStatus = "true";
  toast.setAttribute("role", "status");
  toast.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:18px",
    "transform:translateX(-50%)",
    "z-index:10000",
    "max-width:520px",
    `border:1px solid ${tone === "error" ? "#f3b5b5" : "#b9dfc5"}`,
    "border-radius:12px",
    `background:${tone === "error" ? "#fff4f4" : "#ffffff"}`,
    "box-shadow:0 14px 35px rgba(23,59,42,.15)",
    "padding:12px 14px",
    `color:${tone === "error" ? "#9f1d1d" : "#173b2a"}`,
    "font-size:11px",
    "font-weight:600",
    "font-family:inherit",
  ].join(";");
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), tone === "error" ? 8000 : 5000);
}

function bestFixMessage(fix: GpsFix, assignment: InspectionAssignment) {
  const distance = distanceMeters(fix, assignment);
  return `Detected GPS ${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)} · accuracy ±${Math.round(fix.accuracy)} m · ${distance.toLocaleString()} m from project centre.`;
}

export default function FieldOfficerOfflineSyncTab() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { assignments, verifyArrival } = useInspectionWorkflow();
  const autoVerified = useRef(new Set<string>());
  const manualWatch = useRef<number | null>(null);

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) return;

    const unlock = () => void unlockArrivalAudio();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    const apply = () => {
      if (cancelled) return;
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>("button, a, p, span"),
      );

      elements.forEach((element) => {
        const text = element.textContent?.trim();

        if (text === "Draft Reports" || text === "Offline Sync") {
          const inNavigation = Boolean(
            element.closest("nav") || element.closest("aside"),
          );

          if (inNavigation) {
            const clickable =
              element.closest<HTMLElement>("button, a") ?? element;
            const label = clickable.querySelector<HTMLElement>("span");

            clickable.setAttribute("aria-label", "Offline Sync");
            clickable.setAttribute("title", "Offline Sync");
            clickable.dataset.label = "Offline Sync";
            clickable.classList.add("justify-center");
            clickable.onclick = (event) => {
              event.preventDefault();
              event.stopPropagation();
              navigate("/field-officer/sync");
            };

            if (label) {
              label.textContent = "Offline Sync";
              label.className = "sr-only";
            }
          } else if (text === "Draft Reports") {
            element.textContent = "Offline Saved";
          }
        }

        if (text === "Sync Queue") {
          const clickable = element.closest<HTMLElement>("button, a");
          if (
            clickable &&
            (clickable.closest("nav") || clickable.closest("aside"))
          ) {
            clickable.style.display = "none";
          } else if (location.pathname === "/field-officer/sync") {
            element.textContent = "Offline Sync";
          }
        }
      });

      if (location.pathname === "/field-officer/drafts") {
        navigate("/field-officer/sync", { replace: true });
      }
    };

    apply();
    observer = new MutationObserver(apply);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) return;
    if (!navigator.geolocation) return;

    const onVerifyClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>("button");
      const text = button?.textContent?.trim() ?? "";
      if (!button || !/verify arrival with gps/i.test(text)) return;

      const container = button.closest<HTMLElement>("section") ?? document.body;
      const assignment = assignments.find((item) =>
        container.textContent?.includes(item.projectName),
      );
      if (!assignment) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (manualWatch.current !== null) {
        navigator.geolocation.clearWatch(manualWatch.current);
        manualWatch.current = null;
      }

      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = "Acquiring precise GPS…";
      showGpsStatus("Acquiring a fresh high-accuracy GPS fix. Keep the device still for a few seconds.");

      let best: GpsFix | null = null;
      const startedAt = Date.now();
      const finish = (success: boolean, fix?: GpsFix) => {
        if (manualWatch.current !== null) {
          navigator.geolocation.clearWatch(manualWatch.current);
          manualWatch.current = null;
        }
        button.disabled = false;
        button.textContent = originalText;

        if (!success && fix) {
          showGpsStatus(
            `${bestFixMessage(fix, assignment)} GPS has not yet confirmed that you are inside the ${assignment.geofenceRadius} m project geofence.`,
            "error",
          );
        }
      };

      manualWatch.current = navigator.geolocation.watchPosition(
        (position) => {
          const fix: GpsFix = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : 9999,
            timestamp: position.timestamp,
          };

          if (!best || fix.accuracy < best.accuracy) best = fix;

          const distance = distanceMeters(fix, assignment);
          const fresh = Date.now() - fix.timestamp < 15000;
          const accurateEnough = fix.accuracy <= 100;

          if (fresh && accurateEnough && distance <= assignment.geofenceRadius) {
            const result = verifyArrival(
              assignment.id,
              fix.latitude,
              fix.longitude,
            );
            if (result.allowed) {
              autoVerified.current.add(assignment.id);
              void playArrivalConfirmation();
              showArrivalConfirmation(assignment.projectName, result.distance);
              showGpsStatus(bestFixMessage(fix, assignment));
              finish(true);
              return;
            }
          }

          if (Date.now() - startedAt >= 20000) {
            finish(false, best ?? fix);
          }
        },
        () => {
          showGpsStatus(
            "Unable to obtain precise GPS. Enable Precise Location/GPS for this browser and try again.",
            "error",
          );
          finish(false, best ?? undefined);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 20000,
        },
      );
    };

    document.addEventListener("click", onVerifyClick, true);
    return () => {
      document.removeEventListener("click", onVerifyClick, true);
      if (manualWatch.current !== null) {
        navigator.geolocation.clearWatch(manualWatch.current);
        manualWatch.current = null;
      }
    };
  }, [assignments, location.pathname, verifyArrival]);

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) return;
    if (!navigator.geolocation) return;

    const officerName = session?.name ?? "Amina Yusuf";
    const eligible = assignments.filter(
      (assignment) =>
        assignment.officer === officerName &&
        canVerifyArrival(assignment.status) &&
        !isArrivalFresh(assignment.arrival) &&
        !autoVerified.current.has(assignment.id),
    );

    if (!eligible.length) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (position.coords.accuracy > 100) return;
        if (Date.now() - position.timestamp > 15000) return;

        const current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        const candidates = eligible
          .map((assignment) => ({
            assignment,
            distance: Math.round(
              distanceMeters(current, {
                latitude: assignment.latitude,
                longitude: assignment.longitude,
              }),
            ),
          }))
          .filter(
            ({ assignment, distance }) => distance <= assignment.geofenceRadius,
          )
          .sort((left, right) => {
            const leftActive = left.assignment.routeStartedAt ? 0 : 1;
            const rightActive = right.assignment.routeStartedAt ? 0 : 1;
            return leftActive - rightActive || left.distance - right.distance;
          });

        const nearest = candidates[0];
        if (!nearest || autoVerified.current.has(nearest.assignment.id)) return;

        const result = verifyArrival(
          nearest.assignment.id,
          current.latitude,
          current.longitude,
        );

        if (!result.allowed) return;
        autoVerified.current.add(nearest.assignment.id);
        void playArrivalConfirmation();
        showArrivalConfirmation(nearest.assignment.projectName, result.distance);
      },
      () => {
        // Manual GPS verification remains available if background monitoring fails.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [assignments, location.pathname, session?.name, verifyArrival]);

  return null;
}
