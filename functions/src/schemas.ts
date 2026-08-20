import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .min(12)
  .max(256)
  .refine((value) => /[a-z]/.test(value), "Add a lowercase letter.")
  .refine((value) => /[A-Z]/.test(value), "Add an uppercase letter.")
  .refine((value) => /\d/.test(value), "Add a number.")
  .refine((value) => /[^A-Za-z0-9]/.test(value), "Add a symbol.");
const id = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/);
const shortText = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(500).default("");

export const bootstrapSchema = z.object({ email, password, name: shortText });
export const sessionLoginSchema = z.object({
  idToken: z.string().min(100).max(10_000),
});
export const createUserSchema = z.object({
  email,
  password,
  role: z.enum(["rea", "consultant", "field"]),
  name: shortText,
  phone: optionalText,
  zone: optionalText,
  device: optionalText,
});
export const userStatusSchema = z.object({
  status: z.enum(["Active", "Suspended"]),
});
export const contractorSchema = z.object({
  id: id.optional(),
  name: shortText,
  contactName: optionalText,
  email: z.union([email, z.literal("")]).default(""),
  phone: optionalText,
});
export const projectSchema = z.object({
  id: id.optional(),
  name: shortText,
  programme: shortText,
  component: shortText,
  contractorId: id.nullish(),
  contractor: z.string().trim().max(200).default(""),
  state: shortText,
  lga: shortText,
  community: shortText,
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  kw: z.number().finite().min(0).default(0),
  households: z.number().int().min(0).default(0),
  status: z.string().trim().min(1).max(60).default("Planned"),
});
export const assignmentSchema = z.object({
  id: id.optional(),
  projectId: id,
  officerUserId: id,
  dueDate: z.string().datetime(),
  geofenceRadius: z.number().int().min(25).max(10_000).default(250),
});
export const arrivalSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  deviceId: z.string().trim().max(200).default(""),
  deviceType: z.string().trim().max(200).default(""),
});
const evidenceMetadataSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(255),
  type: z.enum(["photo", "video"]),
  capturedAt: z.string().datetime(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  projectId: z.string().trim().min(1).max(120),
  inspector: shortText,
  deviceId: z.string().trim().max(200),
  deviceType: z.string().trim().max(200),
  previewUrl: z.string().max(4_500_000).optional(),
});
export const reportSchema = z.object({
  assignmentId: id,
  assignedComponent: shortText,
  componentValues: z.record(z.string(), z.string().max(20_000)),
  projectId: id,
  contractor: z.string().max(200),
  state: z.string().max(100),
  lga: z.string().max(100),
  community: z.string().max(200),
  inspectedAt: z.string().datetime(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  inspector: shortText,
  deviceId: z.string().trim().max(200),
  deviceType: z.string().trim().max(200),
  equipmentInstalled: z.string().max(20_000).optional(),
  capacity: z.string().max(1_000).optional(),
  meterDetails: z.string().max(20_000).optional(),
  transformerDetails: z.string().max(20_000).optional(),
  poleCount: z.string().max(1_000).optional(),
  cableLength: z.string().max(1_000).optional(),
  beneficiaries: z.string().max(1_000).optional(),
  observations: z.string().max(50_000).optional(),
  defects: z.string().max(50_000).optional(),
  recommendations: z.string().max(50_000).optional(),
  assetCode: z.string().trim().max(500).default(""),
  evidence: z.array(evidenceMetadataSchema).max(100).default([]),
  communitySignature: z.string().max(2_000_000).optional(),
  contractorSignature: z.string().max(2_000_000).optional(),
  submittedAt: z.string().datetime().optional(),
  reviewNote: z.string().max(20_000).optional(),
  reaReviewNote: z.string().max(20_000).optional(),
  reaReviewedAt: z.string().datetime().optional(),
});
export const reviewSchema = z.object({
  decision: z.enum(["Approved", "Re-inspection"]),
  note: z.string().trim().max(20_000).default(""),
});
export const reaReviewSchema = z.object({
  decision: z.enum(["Verified", "Rejected"]),
  note: z.string().trim().max(20_000).default(""),
});
export const evidenceUploadMetadataSchema = evidenceMetadataSchema.omit({
  previewUrl: true,
});

export type ReportInput = z.infer<typeof reportSchema>;
