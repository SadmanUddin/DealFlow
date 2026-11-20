import {
  changeListingAvailability,
  changeUserRole,
  createReport,
  getAdminDashboard,
  getAdminUser,
  getListingModerationHistory,
  listAdminListings,
  listAdminUsers,
  listAuditLogs,
  listModerationReports,
  listOwnReports,
  moderateListingAdmin,
  moderateUser,
  provisionAdditionalAdmin,
  revokeUserSessions,
  updateModerationReport,
} from '#services/admin.service.js';
import {
  adminIdSchema,
  adminListingQuerySchema,
  adminProvisionSchema,
  adminReasonSchema,
  adminRoleSchema,
  adminUserActionSchema,
  adminUserQuerySchema,
  auditQuerySchema,
  listingAvailabilitySchema,
  reportActionSchema,
  reportCreateSchema,
  reportQuerySchema,
} from '#validations/admin.validation.js';
import { moderationSchema } from '#validations/listing.validation.js';

const id = req => adminIdSchema.parse(req.params).id;
export const adminUsers = async (req, res) =>
  res
    .status(200)
    .json(await listAdminUsers(adminUserQuerySchema.parse(req.query)));
export const adminUser = async (req, res) =>
  res.status(200).json(await getAdminUser(id(req)));
export const userStatus = async (req, res) =>
  res
    .status(200)
    .json(
      await moderateUser(
        req.user.id,
        id(req),
        adminUserActionSchema.parse(req.body),
        req.requestId
      )
    );
export const userRole = async (req, res) =>
  res
    .status(200)
    .json(
      await changeUserRole(
        req.user.id,
        id(req),
        adminRoleSchema.parse(req.body),
        req.requestId
      )
    );
export const userSessions = async (req, res) =>
  res
    .status(200)
    .json(
      await revokeUserSessions(
        req.user.id,
        id(req),
        adminReasonSchema.parse(req.body).reason,
        req.requestId
      )
    );
export const createAdmin = async (req, res) => {
  const parsed = adminProvisionSchema.parse(req.body);
  res
    .status(201)
    .json(
      await provisionAdditionalAdmin(
        req.user.id,
        parsed.email,
        parsed.reason,
        req.requestId
      )
    );
};
export const auditLogs = async (req, res) =>
  res.status(200).json(await listAuditLogs(auditQuerySchema.parse(req.query)));
export const dashboard = async (_req, res) =>
  res.status(200).json(await getAdminDashboard());
export const adminListingQueue = async (req, res) =>
  res
    .status(200)
    .json(await listAdminListings(adminListingQuerySchema.parse(req.query)));
export const moderateListing = async (req, res) => {
  const { id: listingId } = adminIdSchema.parse(req.params);
  const { action, rejectionReason } = moderationSchema.parse(req.body);
  res.status(200).json({
    listing: await moderateListingAdmin(
      req.user.id,
      listingId,
      { action, rejectionReason },
      req.requestId
    ),
  });
};
export const listingStatus = async (req, res) => {
  const parsed = listingAvailabilitySchema.parse(req.body);
  res.status(200).json({
    listing: await changeListingAvailability(
      req.user.id,
      id(req),
      parsed.action,
      parsed.reason,
      req.requestId
    ),
  });
};
export const listingHistory = async (req, res) =>
  res.status(200).json(await getListingModerationHistory(id(req)));
export const submitReport = async (req, res) => {
  const result = await createReport(
    req.user.id,
    reportCreateSchema.parse(req.body)
  );
  res.status(result.created ? 201 : 200).json(result);
};
export const ownReports = async (req, res) =>
  res
    .status(200)
    .json(
      await listOwnReports(
        req.user.id,
        reportQuerySchema.pick({ page: true, limit: true }).parse(req.query)
      )
    );
export const adminReports = async (req, res) =>
  res
    .status(200)
    .json(await listModerationReports(reportQuerySchema.parse(req.query)));
export const updateReport = async (req, res) =>
  res.status(200).json({
    report: await updateModerationReport(
      req.user.id,
      id(req),
      reportActionSchema.parse(req.body),
      req.requestId
    ),
  });
