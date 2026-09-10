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

import {
  canonicalJson,
  CONSULTANT_FIRM,
  deviceAudit,
  FORM_SCHEMA_VERSION,
  GEOFENCE_RADIUS_METRES,
  networkAudit,
  newSessionId,
  OFFICER_ID,
  sha256Text,
  timezone,
} from "./audit";
import { demoAssignments } from "./demoData";
import { distanceMetres, isWithinProjectGeofence } from "./domain";
import type { Assignment, EvidenceRecord, InspectionReport } from "./types";
import { apiArrival, apiAssignments, apiDraft, apiEvidence, apiLogin, apiSubmit } from "./api";

const ASSIGNMENTS_KEY = "veritas-field-assignments-v1";
const SESSION_KEY = "veritas-field-session-v1";
const OFFICER_NAME = "Amina Yusuf";

type SessionRecord = { officerName: string; officerId: string; consultantFirm: string; sessionId: string; signedInAt: string; apiToken?: string; apiExpiresAt?: string };
type ArrivalResult =
  | { ok: true; distanceMetres: number }
  | { ok: false; message: string; distanceMetres?: number };
type ActionResult = { ok: boolean; message: string };

type StoreValue = {
  assignments: Assignment[];
  officerName: string;
  officerId: string;
  consultantFirm: string;
  sessionId: string;
  signedIn: boolean;
  hydrated: boolean;
  isOnline: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  verifyArrival: (assignmentId: string) => Promise<ArrivalResult>;
  saveDraft: (assignmentId: string, values: Record<string, string>, communitySignatory?: string, contractorSignatory?: string) => ActionResult;
  addEvidence: (assignmentId: string, evidence: EvidenceRecord) => ActionResult;
  submitReport: (assignmentId: string, values: Record<string, string>, communitySignatory: string, contractorSignatory: string) => Promise<ActionResult>;
  syncNow: () => Promise<void>;
};

const StoreContext = createContext<StoreValue | null>(null);

function sessionFromStorage(raw: string | null): SessionRecord | null {
  if (!raw) return null;
  if (raw === OFFICER_NAME) return { officerName: OFFICER_NAME, officerId: OFFICER_ID, consultantFirm: CONSULTANT_FIRM, sessionId: newSessionId(), signedInAt: new Date().toISOString() };
  try {
    const parsed = JSON.parse(raw) as SessionRecord;
    return parsed.sessionId ? { ...parsed, officerId: parsed.officerId ?? OFFICER_ID, consultantFirm: parsed.consultantFirm ?? CONSULTANT_FIRM } : null;
  } catch {
    return null;
  }
}

function updatedReport(item: Assignment, values: Record<string, string>, communitySignatory: string, contractorSignatory: string, now: string, actorId: string, actorName: string, consultantFirm: string, sessionId: string): InspectionReport {
  const device = deviceAudit();
  const audit = item.report?.workflowAudit ?? [];
  return {
    ...item.report,
    values,
    evidence: item.report?.evidence ?? [],
    communitySignatory,
    contractorSignatory,
    updatedAt: now,
    draftCreatedAt: item.report?.draftCreatedAt ?? now,
    lastAutosavedAt: now,
    formSchemaVersion: FORM_SCHEMA_VERSION,
    appVersion: device.appVersion,
    appBuild: device.appBuild,
    assignmentSnapshot: {
      assignmentId: item.id,
      projectId: item.projectId ?? item.id,
      projectName: item.projectName,
      programme: item.programme,
      component: item.component,
      contractor: item.contractor,
    },
    officerAudit: { officerId: actorId, officerName: actorName, consultantFirm, sessionId },
    deviceAudit: device,
    captureTimezone: timezone(),
    workflowAudit: item.report?.draftCreatedAt
      ? audit
      : [...audit, { action: "draft-created", actorId, actorName, actorRole: "Field Officer", at: now }],
    syncAudit: { ...item.report?.syncAudit, attempts: item.report?.syncAudit?.attempts ?? 0, queuedAt: now },
  };
}

export function StoreProvider({ children }: PropsWithChildren) {
  const [assignments, setAssignments] = useState<Assignment[]>(demoAssignments);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    void Promise.all([AsyncStorage.getItem(ASSIGNMENTS_KEY), AsyncStorage.getItem(SESSION_KEY), Network.getNetworkStateAsync()]).then(([storedAssignments, storedSession, network]) => {
      if (storedAssignments) {
        try {
          const parsed = JSON.parse(storedAssignments) as Assignment[];
          const missing = demoAssignments.filter((demo) => !parsed.some((item) => item.id === demo.id));
          setAssignments([...parsed, ...missing]);
        } catch { setAssignments(demoAssignments); }
      }
      const hydratedSession = sessionFromStorage(storedSession);
      setSession(hydratedSession);
      if (hydratedSession && storedSession === OFFICER_NAME) void AsyncStorage.setItem(SESSION_KEY, JSON.stringify(hydratedSession));
      setIsOnline(Boolean(network.isConnected && network.isInternetReachable !== false));
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated) void AsyncStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
  }, [assignments, hydrated]);

  useEffect(() => {
    const timer = setInterval(() => {
      void Network.getNetworkStateAsync().then((network) => setIsOnline(Boolean(network.isConnected && network.isInternetReachable !== false)));
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    try {
      const result = await apiLogin(identifier, password);
      if (result.user.role !== "field_officer") return false;
      const nextSession: SessionRecord = { officerName: result.user.name, officerId: result.user.id, consultantFirm: result.user.consultantFirm, sessionId: newSessionId(), signedInAt: new Date().toISOString(), apiToken: result.token, apiExpiresAt: result.expiresAt };
      const remote = await apiAssignments(result.token);
      if (remote.assignments.length) setAssignments((current) => [...current.filter((item) => item.officer !== nextSession.officerName), ...remote.assignments]);
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  const verifyArrival = useCallback(async (assignmentId: string): Promise<ArrivalResult> => {
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment) return { ok: false, message: "Assignment not found." };
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") return { ok: false, message: "Location permission is required for arrival verification." };
    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const distance = distanceMetres(current.coords.latitude, current.coords.longitude, assignment.latitude, assignment.longitude);
      if (!isWithinProjectGeofence(distance, GEOFENCE_RADIUS_METRES)) {
        return { ok: false, distanceMetres: distance, message: `Verification blocked — you are ${Math.round(distance).toLocaleString()} m outside the project centre.` };
      }
      const verifiedAt = new Date().toISOString();
      setAssignments((items) => items.map((item) => item.id === assignmentId ? {
        ...item,
        syncStatus: "queued",
        arrival: {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          distanceMetres: distance,
          verifiedAt,
          accuracyMetres: current.coords.accuracy,
          altitudeMetres: current.coords.altitude,
          headingDegrees: current.coords.heading,
          speedMetresPerSecond: current.coords.speed,
          mocked: current.mocked,
          geofenceRadiusMetres: GEOFENCE_RADIUS_METRES,
          timezone: timezone(),
        },
      } : item));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return { ok: true, distanceMetres: distance };
    } catch {
      return { ok: false, message: "GPS could not determine your location. Turn on Location Services and try again." };
    }
  }, [assignments]);

  const saveDraft = useCallback((assignmentId: string, values: Record<string, string>, communitySignatory = "", contractorSignatory = ""): ActionResult => {
    const target = assignments.find((item) => item.id === assignmentId);
    if (!target?.arrival) return { ok: false, message: "Verify GPS arrival to unlock and save this form." };
    if (["Submitted", "Approved", "Verified"].includes(target.status)) return { ok: false, message: "This inspection is locked." };
    const now = new Date().toISOString();
    setAssignments((items) => items.map((item) => item.id === assignmentId ? { ...item, status: "Draft", syncStatus: "queued", report: updatedReport(item, values, communitySignatory, contractorSignatory, now, session?.officerId ?? OFFICER_ID, session?.officerName ?? OFFICER_NAME, session?.consultantFirm ?? CONSULTANT_FIRM, session?.sessionId ?? "") } : item));
    return { ok: true, message: "Draft saved on this device." };
  }, [assignments, session]);

  const addEvidence = useCallback((assignmentId: string, evidence: EvidenceRecord): ActionResult => {
    const target = assignments.find((item) => item.id === assignmentId);
    if (!target?.arrival) return { ok: false, message: "Verify GPS arrival before capturing evidence." };
    const now = new Date().toISOString();
    setAssignments((items) => items.map((item) => {
      if (item.id !== assignmentId) return item;
      const report = updatedReport(item, item.report?.values ?? {}, item.report?.communitySignatory ?? "", item.report?.contractorSignatory ?? "", now, session?.officerId ?? OFFICER_ID, session?.officerName ?? OFFICER_NAME, session?.consultantFirm ?? CONSULTANT_FIRM, session?.sessionId ?? "");
      return { ...item, status: item.status === "Assigned" ? "Draft" : item.status, syncStatus: "queued", report: { ...report, evidence: [...report.evidence, evidence] } };
    }));
    return { ok: true, message: "Evidence secured." };
  }, [assignments, session]);

  const submitReport = useCallback(async (assignmentId: string, values: Record<string, string>, communitySignatory: string, contractorSignatory: string): Promise<ActionResult> => {
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment?.arrival) return { ok: false, message: "Verify arrival with GPS before submission." };
    const evidence = assignment.report?.evidence ?? [];
    if (!evidence.length) return { ok: false, message: "Capture at least one evidence photo or video." };
    if (!communitySignatory.trim() || !contractorSignatory.trim()) return { ok: false, message: "Add both representative signatories." };
    const now = new Date().toISOString();
    const signatures = {
      community: { name: communitySignatory.trim(), role: "Community representative" as const, signedAt: now, latitude: assignment.arrival.latitude, longitude: assignment.arrival.longitude, method: "typed-name" as const },
      contractor: { name: contractorSignatory.trim(), role: "Contractor representative" as const, signedAt: now, latitude: assignment.arrival.latitude, longitude: assignment.arrival.longitude, method: "typed-name" as const },
    };
    const formIntegrityHash = await sha256Text(canonicalJson({ assignmentId, values, evidence: evidence.map((item) => item.integrityHash ?? item.id), signatures }));
    const signatureIntegrityHash = await sha256Text(canonicalJson(signatures));
    setAssignments((items) => items.map((item) => item.id === assignmentId ? {
      ...item,
      status: "Submitted",
      syncStatus: "queued",
      report: {
        ...updatedReport(item, values, communitySignatory.trim(), contractorSignatory.trim(), now, session?.officerId ?? OFFICER_ID, session?.officerName ?? OFFICER_NAME, session?.consultantFirm ?? CONSULTANT_FIRM, session?.sessionId ?? ""),
        evidence,
        submittedAt: now,
        lockedAt: now,
        formIntegrityAlgorithm: "SHA-256",
        formIntegrityHash,
        signatureIntegrityHash,
        communitySignature: signatures.community,
        contractorSignature: signatures.contractor,
        workflowAudit: [...(item.report?.workflowAudit ?? []), { action: "submitted", actorId: session?.officerId ?? OFFICER_ID, actorName: session?.officerName ?? OFFICER_NAME, actorRole: "Field Officer", at: now }],
      },
    } : item));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return { ok: true, message: "Inspection submitted for Consultant Admin review." };
  }, [assignments, session]);

  const syncNow = useCallback(async () => {
    if (!isOnline || !session?.apiToken) return;
    const startedAt = new Date().toISOString();
    const network = await networkAudit();
    setAssignments((items) => items.map((item) => item.syncStatus === "queued" || item.syncStatus === "failed" ? {
      ...item,
      syncStatus: "uploading",
      report: item.report ? { ...item.report, syncAudit: { ...item.report.syncAudit, ...network, attempts: (item.report.syncAudit?.attempts ?? 0) + 1, uploadStartedAt: startedAt } } : item.report,
    } : item));
    // Replace this acknowledgement with the Veritas API response when backend sync is connected.
    await new Promise((resolve) => setTimeout(resolve, 900));
    const completedAt = new Date().toISOString();
    for (const item of assignments.filter((candidate) => candidate.syncStatus === "queued" || candidate.syncStatus === "failed")) {
      try {
        if (item.arrival) await apiArrival(session.apiToken, item.id, item.arrival);
        if (item.report) {
          for (const evidence of item.report.evidence) await apiEvidence(session.apiToken, item.id, evidence);
          if (item.status === "Submitted") await apiSubmit(session.apiToken, item.id, item.report);
          else await apiDraft(session.apiToken, item.id, item.report);
        }
        setAssignments((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, syncStatus: "synced", report: candidate.report ? { ...candidate.report, syncAudit: { ...candidate.report.syncAudit, attempts: candidate.report.syncAudit?.attempts ?? 1, uploadCompletedAt: completedAt, serverReceivedAt: completedAt } } : candidate.report } : candidate));
      } catch (error) {
        setAssignments((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, syncStatus: "failed", report: candidate.report ? { ...candidate.report, syncAudit: { ...candidate.report.syncAudit, attempts: candidate.report.syncAudit?.attempts ?? 1, lastError: error instanceof Error ? error.message : "Synchronization failed." } } : candidate.report } : candidate));
      }
    }
    const remote = await apiAssignments(session.apiToken).catch(() => null);
    if (remote?.assignments.length) setAssignments((current) => {
      const localById = new Map(current.map((item) => [item.id, item]));
      const merged = remote.assignments.map((item) => {
        const local = localById.get(item.id);
        return { ...item, report: local?.report ?? item.report, arrival: item.arrival ?? local?.arrival, syncStatus: "synced" as const };
      });
      return [...current.filter((item) => item.officer !== session.officerName), ...merged];
    });
  }, [isOnline, session, assignments]);

  const value = useMemo<StoreValue>(() => ({
    assignments: assignments.filter((item) => item.officer === (session?.officerName ?? OFFICER_NAME)),
    officerName: session?.officerName ?? OFFICER_NAME,
    officerId: session?.officerId ?? OFFICER_ID,
    consultantFirm: session?.consultantFirm ?? CONSULTANT_FIRM,
    sessionId: session?.sessionId ?? "",
    signedIn: Boolean(session),
    hydrated,
    isOnline,
    login,
    logout,
    verifyArrival,
    saveDraft,
    addEvidence,
    submitReport,
    syncNow,
  }), [assignments, session, hydrated, isOnline, login, logout, verifyArrival, saveDraft, addEvidence, submitReport, syncNow]);

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
