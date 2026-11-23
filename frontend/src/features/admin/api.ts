import { z } from "zod";
import {
  getValidated,
  paginationSchema,
  patchValidated,
  postValidated,
} from "@/features/workspace/api-core";

const dateValue = z.string().or(z.date());
const roleSchema = z.enum(["buyer", "seller", "admin"]);
const userSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  email: z.string().email(),
  role: roleSchema,
  emailVerified: z.boolean(),
  isActive: z.boolean(),
  suspensionReason: z.string().nullable(),
  suspendedAt: dateValue.nullable(),
  suspendedBy: z.number().int().positive().nullable(),
  createdAt: dateValue,
  updatedAt: dateValue,
});
export type AdminUser = z.infer<typeof userSchema>;

export const listAdminUsers = (params: {
  page: number;
  limit: number;
  q?: string;
  role?: AdminUser["role"] | "all";
  status?: "active" | "suspended" | "all";
}) =>
  getValidated(
    "/admin/users",
    z.object({ users: z.array(userSchema), pagination: paginationSchema }),
    {
      ...params,
      role: params.role === "all" ? undefined : params.role,
      status: params.status === "all" ? undefined : params.status,
      q: params.q || undefined,
    },
  );

export const getAdminUser = (id: number) =>
  getValidated(
    `/admin/users/${id}`,
    z.object({
      user: userSchema,
      activeSessionCount: z.number().int().nonnegative(),
    }),
  );

export const changeAdminUserStatus = (
  id: number,
  input: { action: "suspend" | "reactivate"; reason: string },
) =>
  patchValidated(
    `/admin/users/${id}/status`,
    input,
    z.object({
      user: userSchema,
      activeSessionCount: z.number().int().nonnegative(),
    }),
  );

export const changeAdminUserRole = (
  id: number,
  input: { role: AdminUser["role"]; reason: string },
) =>
  patchValidated(
    `/admin/users/${id}/role`,
    input,
    z.object({
      user: userSchema,
      activeSessionCount: z.number().int().nonnegative(),
    }),
  );

export const revokeAdminUserSessions = (id: number, reason: string) =>
  postValidated(
    `/admin/users/${id}/revoke-sessions`,
    { reason },
    z.object({ revokedCount: z.number().int().nonnegative() }),
  );

const listingStatusSchema = z.enum([
  "draft",
  "pending",
  "published",
  "rejected",
  "archived",
  "suspended",
  "sold",
]);
export type AdminListingStatus = z.infer<typeof listingStatusSchema>;
const adminListingSchema = z.object({
  id: z.number().int().positive(),
  sellerId: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  askingPrice: z.string().nullable().optional(),
  annualRevenue: z.string().nullable().optional(),
  ebitda: z.string().nullable().optional(),
  currency: z.string().length(3).optional(),
  hasImage: z.boolean().optional(),
  rejectionReason: z.string().nullable().optional(),
  status: listingStatusSchema,
  moderationReason: z.string().nullable(),
  moderatedBy: z.number().int().positive().nullable(),
  moderatedAt: dateValue.nullable(),
  createdAt: dateValue,
  updatedAt: dateValue,
});
export type AdminListing = z.infer<typeof adminListingSchema>;
export const listAdminListings = (params: {
  page: number;
  limit: number;
  status?: AdminListingStatus | "all";
  q?: string;
}) =>
  getValidated(
    "/admin/listings",
    z.object({
      listings: z.array(adminListingSchema),
      pagination: paginationSchema,
    }),
    {
      ...params,
      status: params.status === "all" ? undefined : params.status,
      q: params.q || undefined,
    },
  );

const listingActionResponse = z.object({
  listing: z.object({
    id: z.number(),
    status: listingStatusSchema,
    moderatedAt: dateValue.nullable().optional(),
  }),
});
export const moderateAdminListing = (
  id: number,
  input: { action: "approve" | "reject"; rejectionReason?: string },
) =>
  patchValidated(
    `/admin/listings/${id}/moderation`,
    input,
    listingActionResponse,
  );
export const changeAdminListingAvailability = (
  id: number,
  input: { action: "suspend" | "restore"; reason: string },
) =>
  patchValidated(`/admin/listings/${id}/status`, input, listingActionResponse);

const auditSchema = z.object({
  id: z.number().int().positive(),
  actorId: z.number().int().positive().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  reason: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  requestId: z.string().nullable(),
  createdAt: dateValue,
});
export type AuditEntry = z.infer<typeof auditSchema>;
const auditResponse = z.object({
  auditLogs: z.array(auditSchema),
  pagination: paginationSchema,
});
export const listAuditLogs = (params: {
  page: number;
  limit: number;
  actorId?: number;
  action?: string;
  targetType?: "user" | "listing" | "report" | "admin" | "all";
  targetId?: string;
}) =>
  getValidated("/admin/audit-logs", auditResponse, {
    ...params,
    targetType: params.targetType === "all" ? undefined : params.targetType,
    action: params.action || undefined,
    targetId: params.targetId || undefined,
  });

export const getAdminListingHistory = (id: number) =>
  getValidated(`/admin/listings/${id}/history`, auditResponse);

const reportStatusSchema = z.enum([
  "pending",
  "under_review",
  "resolved",
  "dismissed",
]);
export type AdminReportStatus = z.infer<typeof reportStatusSchema>;
export const reportCategories = [
  "suspicious_activity",
  "misleading_information",
  "potential_scam",
  "marketplace_violation",
  "other",
] as const;
const reportSchema = z.object({
  id: z.number().int().positive(),
  reporterId: z.number().int().positive(),
  listingId: z.number().int().positive().nullable(),
  reportedUserId: z.number().int().positive().nullable(),
  category: z.enum(reportCategories),
  description: z.string(),
  status: reportStatusSchema,
  moderatorNotes: z.string().nullable(),
  resolutionReason: z.string().nullable(),
  assignedTo: z.number().int().positive().nullable(),
  resolvedBy: z.number().int().positive().nullable(),
  createdAt: dateValue,
  resolvedAt: dateValue.nullable(),
});
export type AdminReport = z.infer<typeof reportSchema>;
export const listAdminReports = (params: {
  page: number;
  limit: number;
  status?: AdminReportStatus | "all";
  category?: (typeof reportCategories)[number] | "all";
  q?: string;
}) =>
  getValidated(
    "/admin/reports",
    z.object({ reports: z.array(reportSchema), pagination: paginationSchema }),
    {
      ...params,
      status: params.status === "all" ? undefined : params.status,
      category: params.category === "all" ? undefined : params.category,
      q: params.q || undefined,
    },
  );

export const updateAdminReport = (
  id: number,
  input: {
    status: Exclude<AdminReportStatus, "pending">;
    reason: string;
    moderatorNotes?: string;
  },
) =>
  patchValidated(
    `/admin/reports/${id}`,
    input,
    z.object({
      report: z.object({
        id: z.number(),
        status: reportStatusSchema,
        assignedTo: z.number().nullable(),
        resolvedBy: z.number().nullable(),
        resolvedAt: dateValue.nullable(),
        auditId: z.number(),
      }),
    }),
  );

export const getAdminDashboard = () =>
  getValidated(
    "/admin/dashboard",
    z.object({
      users: z.object({
        total: z.number().int().nonnegative(),
        active: z.number().int().nonnegative(),
        suspended: z.number().int().nonnegative(),
        buyers: z.number().int().nonnegative(),
        sellers: z.number().int().nonnegative(),
      }),
      listings: z.object({
        total: z.number().int().nonnegative(),
        pending: z.number().int().nonnegative(),
        published: z.number().int().nonnegative(),
        rejected: z.number().int().nonnegative(),
        suspended: z.number().int().nonnegative(),
      }),
      reports: z.object({
        open: z.number().int().nonnegative(),
        recentlyResolved: z.number().int().nonnegative(),
      }),
      recentActions: z.array(
        z.object({
          id: z.number(),
          actorId: z.number().nullable(),
          action: z.string(),
          targetType: z.string(),
          targetId: z.string(),
          createdAt: dateValue,
        }),
      ),
    }),
  );
