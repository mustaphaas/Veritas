export type UserRole = "rea" | "consultant" | "field";
export type UserStatus = "Active" | "Suspended";

export type UserProfile = {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  phone: string;
  zone: string;
  device: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type SessionUser = UserProfile & {
  roleLabel: string;
  initials: string;
  path: string;
};

export type AssignmentStatus =
  | "Assigned"
  | "En route"
  | "Arrived"
  | "Draft"
  | "Submitted"
  | "Approved"
  | "Verified"
  | "Rejected"
  | "Re-inspection";

export type Actor = SessionUser & { uid: string };
