export type UserRole = "rea" | "consultant" | "field";

export type UserStatus = "Active" | "Suspended";

export type PublicUser = {
  id: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  name: string;
  initials: string;
  path: string;
  phone: string;
  zone: string;
  device: string;
  status: UserStatus;
  createdAt: string;
};

export type AuthSession = PublicUser;

export type ApiErrorBody = {
  error: string;
  code: string;
  requestId?: string;
  details?: Record<string, string[]>;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  user: AuthSession;
};

export type WorkflowResponse<TAssignment, TFieldOfficer> = {
  assignments: TAssignment[];
  fieldOfficers: TFieldOfficer[];
};
