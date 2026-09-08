export type AssignmentStatus =
  | "Assigned"
  | "Draft"
  | "Submitted"
  | "Approved"
  | "Verified"
  | "Re-inspection";

export type DisplayStatus = "Assigned" | "Draft" | "Approved" | "Verified";
export type SyncStatus = "synced" | "queued" | "uploading" | "failed";
export type ProjectComponent = "Grid Extension" | "Mini Grid" | "SAS";

export type ArrivalRecord = {
  latitude: number;
  longitude: number;
  distanceMetres: number;
  verifiedAt: string;
};

export type EvidenceRecord = {
  id: string;
  uri: string;
  type: "photo";
  capturedAt: string;
  latitude: number;
  longitude: number;
  projectId: string;
  inspector: string;
  deviceName: string;
};

export type InspectionReport = {
  values: Record<string, string>;
  evidence: EvidenceRecord[];
  communitySignatory: string;
  contractorSignatory: string;
  updatedAt: string;
  submittedAt?: string;
};

export type Assignment = {
  id: string;
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
};

export type FormSection = {
  title: string;
  fields: FormField[];
};
