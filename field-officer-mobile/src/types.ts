export type AssignmentStatus =
  | "Assigned"
  | "Draft"
  | "Submitted"
  | "Approved"
  | "Verified"
  | "Re-inspection";

export type DisplayStatus = AssignmentStatus;
export type SyncStatus = "synced" | "queued" | "uploading" | "failed";
export type ProjectComponent = "Grid Extension" | "Mini Grid" | "SAS";

export type ArrivalRecord = {
  latitude: number;
  longitude: number;
  distanceMetres: number;
  verifiedAt: string;
  accuracyMetres?: number | null;
  altitudeMetres?: number | null;
  headingDegrees?: number | null;
  speedMetresPerSecond?: number | null;
  mocked?: boolean;
  geofenceRadiusMetres?: number;
  timezone?: string;
};

export type DeviceAudit = {
  androidId: string | null;
  manufacturer: string | null;
  brand: string | null;
  modelName: string | null;
  deviceName: string | null;
  osName: string | null;
  osVersion: string | null;
  osBuildId: string | null;
  isPhysicalDevice: boolean;
  appVersion: string | null;
  appBuild: string | null;
  formSchemaVersion: string;
};

export type WorkflowAuditEvent = {
  action: "draft-created" | "autosaved" | "submitted" | "approved" | "verified" | "reinspection-requested";
  actorId: string;
  actorName: string;
  actorRole: "Field Officer" | "Consultant Reviewer" | "REA Verifier";
  at: string;
  note?: string;
};

export type SyncAudit = {
  queuedAt?: string;
  uploadStartedAt?: string;
  uploadCompletedAt?: string;
  attempts: number;
  lastError?: string;
  localIpAddress?: string;
  networkType?: string;
  serverRecordId?: string;
  serverReceivedAt?: string;
  publicIpAddress?: string;
};

export type SignatoryAudit = {
  name: string;
  role: "Community representative" | "Contractor representative";
  signedAt: string;
  latitude: number;
  longitude: number;
  method: "typed-name";
};

export type EvidenceRecord = {
  id: string;
  uri: string;
  type: "photo" | "video";
  capturedAt: string;
  latitude: number;
  longitude: number;
  projectId: string;
  inspector: string;
  deviceName: string;
  assignmentId?: string;
  programme?: string;
  component?: ProjectComponent;
  contractor?: string;
  officerId?: string;
  consultantFirm?: string;
  sessionId?: string;
  timezone?: string;
  gpsAccuracyMetres?: number | null;
  altitudeMetres?: number | null;
  headingDegrees?: number | null;
  speedMetresPerSecond?: number | null;
  mocked?: boolean;
  captureSequence?: number;
  durationSeconds?: number | null;
  fileSizeBytes?: number | null;
  integrityAlgorithm?: "SHA-256";
  integrityHash?: string;
  localIpAddress?: string;
  networkType?: string;
  device?: DeviceAudit;
};

export type InspectionReport = {
  values: Record<string, string>;
  evidence: EvidenceRecord[];
  communitySignatory: string;
  contractorSignatory: string;
  updatedAt: string;
  submittedAt?: string;
  draftCreatedAt?: string;
  lastAutosavedAt?: string;
  lockedAt?: string;
  formSchemaVersion?: string;
  appVersion?: string | null;
  appBuild?: string | null;
  formIntegrityAlgorithm?: "SHA-256";
  formIntegrityHash?: string;
  signatureIntegrityHash?: string;
  communitySignature?: SignatoryAudit;
  contractorSignature?: SignatoryAudit;
  workflowAudit?: WorkflowAuditEvent[];
  syncAudit?: SyncAudit;
  assignmentSnapshot?: {
    assignmentId: string;
    projectId: string;
    projectName: string;
    programme: string;
    component: ProjectComponent;
    contractor: string;
  };
  officerAudit?: {
    officerId: string;
    officerName: string;
    consultantFirm: string;
    sessionId: string;
  };
  deviceAudit?: DeviceAudit;
  captureTimezone?: string;
};

export type Assignment = {
  id: string;
  projectId?: string;
  projectName: string;
  programme: "NEP" | "DARES" | "AMP";
  component: ProjectComponent;
  contractor: string;
  state: string;
  lga: string;
  community: string;
  latitude: number;
  longitude: number;
  dueDate: string;
  status: AssignmentStatus;
  syncStatus: SyncStatus;
  officer: string;
  arrival?: ArrivalRecord;
  report?: InspectionReport;
};

export type FormField = {
  key: string;
  label: string;
  keyboard?: "default" | "numeric" | "phone-pad" | "decimal-pad";
  assigned?: keyof Assignment;
  options?: string[];
  group?: string;
};

export type FormSection = {
  title: string;
  fields: FormField[];
};
