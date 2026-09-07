import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "rea-inspection-workflow-v4";
const MOCK_ID = "REA-FCT-GPS-0001";
const REFRESH_KEY = "rea-field-demo-panama-refresh-v2";

export default function FieldOfficerCoordinateMock() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const assignments = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(assignments)) return;

      const due = new Date();
      due.setDate(due.getDate() + 3);
      const now = new Date().toISOString();

      const existingIndex = assignments.findIndex((item) => item?.id === MOCK_ID);
      const existing = existingIndex >= 0 ? assignments[existingIndex] : null;

      const mockAssignment = {
        ...(existing ?? {}),
        id: MOCK_ID,
        projectName: "Panama Abuja GPS Field Demo",
        programme: "DARES",
        component: "Mini Grid",
        contractor: "Veritas Demo Contractor",
        state: "FCT",
        lga: "Abuja Municipal Area Council",
        community: "Panama, Abuja",
        officer: "Amina Yusuf",
        dueDate: existing?.dueDate ?? due.toISOString(),
        latitude: 9.101435,
        longitude: 7.4936936,
        geofenceRadius: 250,
        status: "Assigned",
        routeStartedAt: undefined,
        arrival: undefined,
        report: undefined,
        syncStatus: "synced",
        audit: [
          {
            id: `audit-${Date.now().toString(36)}`,
            at: now,
            actor: "Consultant Admin",
            action: "Reset Panama Abuja GPS demo for live arrival verification",
            deviceId: "REA-DEMO-DEVICE",
            deviceType: "Mobile phone",
          },
        ],
      };

      const updated = [...assignments];
      if (existingIndex >= 0) {
        updated[existingIndex] = mockAssignment;
      } else {
        updated.unshift(mockAssignment);
      }

      // Only re-seed the demo project's identity/location fields — never
      // treat a successful arrival verification or an in-progress route as
      // something to wipe. Previously `Boolean(existing.arrival)` was in
      // this list, which meant the instant an officer verified arrival at
      // the real Panama, Abuja coordinates, the next run of this effect
      // reset the assignment and force-reloaded the page, discarding the
      // verified state and making GPS checks look like they "didn't work".
      const shouldReset =
        !existing ||
        existing.projectName !== "Panama Abuja GPS Field Demo" ||
        existing.community !== "Panama, Abuja" ||
        existing.lga !== "Abuja Municipal Area Council" ||
        existing.latitude !== 9.101435 ||
        existing.longitude !== 7.4936936;

      if (shouldReset) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        if (window.sessionStorage.getItem(REFRESH_KEY) !== "done") {
          window.sessionStorage.setItem(REFRESH_KEY, "done");
          window.location.reload();
          return;
        }
      }

      window.sessionStorage.removeItem(REFRESH_KEY);
    } catch {
      // Demo data injection should never block the field officer page.
    }
  }, [location.pathname]);

  return null;
}
