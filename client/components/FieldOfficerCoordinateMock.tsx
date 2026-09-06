import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "rea-inspection-workflow-v4";
const MOCK_ID = "REA-FCT-GPS-0001";

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
        status: existing?.status ?? "Assigned",
        syncStatus: existing?.syncStatus ?? "synced",
        audit: existing?.audit ?? [
          {
            id: `audit-${Date.now().toString(36)}`,
            at: now,
            actor: "Consultant Admin",
            action: "Assigned Panama Abuja GPS field demo to Amina Yusuf",
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

      const oldValue = raw;
      const newValue = JSON.stringify(updated);
      if (oldValue === newValue) return;

      window.localStorage.setItem(STORAGE_KEY, newValue);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          oldValue,
          newValue,
          storageArea: window.localStorage,
        }),
      );
    } catch {
      // Demo data injection should never block the field officer page.
    }
  }, [location.pathname]);

  return null;
}
