import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Network from "expo-network";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { demoAssignments } from "./demoData";
import { distanceMetres, isWithinProjectGeofence } from "./domain";
import type { Assignment, EvidenceRecord } from "./types";

const ASSIGNMENTS_KEY = "veritas-field-assignments-v1";
const SESSION_KEY = "veritas-field-session-v1";

type ArrivalResult =
  | { ok: true; distanceMetres: number }
  | { ok: false; message: string; distanceMetres?: number };

type StoreValue = {
  assignments: Assignment[];
  officerName: string;
  signedIn: boolean;
  hydrated: boolean;
  isOnline: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  verifyArrival: (assignmentId: string) => Promise<ArrivalResult>;
  saveDraft: (
    assignmentId: string,
    values: Record<string, string>,
    communitySignatory?: string,
    contractorSignatory?: string,
  ) => void;
  addEvidence: (assignmentId: string, evidence: EvidenceRecord) => void;
  submitReport: (
    assignmentId: string,
    values: Record<string, string>,
    communitySignatory: string,
    contractorSignatory: string,
  ) => { ok: boolean; message: string };
  syncNow: () => Promise<void>;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: PropsWithChildren) {
  const [assignments, setAssignments] = useState<Assignment[]>(demoAssignments);
  const [signedIn, setSignedIn] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    void Promise.all([
      AsyncStorage.getItem(ASSIGNMENTS_KEY),
      AsyncStorage.getItem(SESSION_KEY),
      Network.getNetworkStateAsync(),
    ]).then(([storedAssignments, session, network]) => {
      if (storedAssignments) {
        try {
          setAssignments(JSON.parse(storedAssignments) as Assignment[]);
        } catch {
          setAssignments(demoAssignments);
        }
      }
      setSignedIn(session === "Amina Yusuf");
      setIsOnline(Boolean(network.isConnected && network.isInternetReachable !== false));
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
  }, [assignments, hydrated]);

  useEffect(() => {
    const timer = setInterval(() => {
      void Network.getNetworkStateAsync().then((network) =>
        setIsOnline(Boolean(network.isConnected && network.isInternetReachable !== false)),
      );
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const valid =
      email.trim().toLowerCase() === "field.officer@demo.ng" &&
      password === "Field2024!";
    if (!valid) return false;
    await AsyncStorage.setItem(SESSION_KEY, "Amina Yusuf");
    setSignedIn(true);
    return true;
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setSignedIn(false);
  }, []);

  const verifyArrival = useCallback(async (assignmentId: string): Promise<ArrivalResult> => {
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment) return { ok: false, message: "Assignment not found." };
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      return { ok: false, message: "Location permission is required for arrival verification." };
    }
    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const distance = distanceMetres(
        current.coords.latitude,
        current.coords.longitude,
        assignment.latitude,
        assignment.longitude,
      );
      if (!isWithinProjectGeofence(distance)) {
        return {
          ok: false,
          distanceMetres: distance,
          message: `Verification blocked — you are ${Math.round(distance).toLocaleString()} m outside the project centre.`,
        };
      }
      setAssignments((currentAssignments) =>
        currentAssignments.map((item) =>
          item.id === assignmentId
            ? {
                ...item,
                arrival: {
                  latitude: current.coords.latitude,
                  longitude: current.coords.longitude,
                  distanceMetres: distance,
                  verifiedAt: new Date().toISOString(),
                },
              }
            : item,
        ),
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return { ok: true, distanceMetres: distance };
    } catch {
      return {
        ok: false,
        message: "GPS could not determine your location. Turn on Location Services and try again.",
      };
    }
  }, [assignments]);

  const saveDraft = useCallback(
    (
      assignmentId: string,
      values: Record<string, string>,
      communitySignatory = "",
      contractorSignatory = "",
    ) => {
      setAssignments((current) =>
        current.map((item) => {
          if (item.id !== assignmentId || ["Submitted", "Approved", "Verified"].includes(item.status)) {
            return item;
          }
          return {
            ...item,
            status: "Draft",
            syncStatus: "queued",
            report: {
              values,
              evidence: item.report?.evidence ?? [],
              communitySignatory,
              contractorSignatory,
              updatedAt: new Date().toISOString(),
            },
          };
        }),
      );
    },
    [],
  );

  const addEvidence = useCallback((assignmentId: string, evidence: EvidenceRecord) => {
    setAssignments((current) =>
      current.map((item) => {
        if (item.id !== assignmentId) return item;
        return {
          ...item,
          status: item.status === "Assigned" ? "Draft" : item.status,
          syncStatus: "queued",
          report: {
            values: item.report?.values ?? {},
            communitySignatory: item.report?.communitySignatory ?? "",
            contractorSignatory: item.report?.contractorSignatory ?? "",
            ...item.report,
            evidence: [...(item.report?.evidence ?? []), evidence],
            updatedAt: new Date().toISOString(),
          },
        };
      }),
    );
  }, []);

  const submitReport = useCallback((
    assignmentId: string,
    values: Record<string, string>,
    communitySignatory: string,
    contractorSignatory: string,
  ) => {
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment?.arrival) return { ok: false, message: "Verify arrival with GPS before submission." };
    const evidence = assignment.report?.evidence ?? [];
    if (!evidence.length) return { ok: false, message: "Capture at least one evidence photo." };
    if (!communitySignatory.trim() || !contractorSignatory.trim()) {
      return { ok: false, message: "Add both representative signatories." };
    }
    setAssignments((current) =>
      current.map((item) =>
        item.id === assignmentId
          ? {
              ...item,
              status: "Submitted",
              syncStatus: "queued",
              report: {
                values,
                evidence,
                communitySignatory: communitySignatory.trim(),
                contractorSignatory: contractorSignatory.trim(),
                updatedAt: new Date().toISOString(),
                submittedAt: new Date().toISOString(),
              },
            }
          : item,
      ),
    );
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return { ok: true, message: "Inspection submitted for Consultant Admin review." };
  }, [assignments]);

  const syncNow = useCallback(async () => {
    if (!isOnline) return;
    setAssignments((current) =>
      current.map((item) => (item.syncStatus === "queued" ? { ...item, syncStatus: "uploading" } : item)),
    );
    await new Promise((resolve) => setTimeout(resolve, 900));
    setAssignments((current) =>
      current.map((item) => (item.syncStatus === "uploading" ? { ...item, syncStatus: "synced" } : item)),
    );
  }, [isOnline]);

  const value = useMemo<StoreValue>(
    () => ({
      assignments,
      officerName: "Amina Yusuf",
      signedIn,
      hydrated,
      isOnline,
      login,
      logout,
      verifyArrival,
      saveDraft,
      addEvidence,
      submitReport,
      syncNow,
    }),
    [assignments, signedIn, hydrated, isOnline, login, logout, verifyArrival, saveDraft, addEvidence, submitReport, syncNow],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}

export function deviceName() {
  return Device.modelName ?? Device.deviceName ?? "Android device";
}
