import { and, desc, eq, gt, gte, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '#config/database.js';
import { users, authSessions } from '#models/user.model.js';
import { businessListings } from '#models/listing.model.js';
import { adminAuditLogs, moderationReports } from '#models/admin.model.js';
import { AppError } from '#utils/app-error.js';

const pageResult = (page, limit, total) => ({ page, limit, total, totalPages: Math.ceil(total / limit) });
const userFields = { id: users.id, name: users.name, email: users.email, role: users.role, emailVerified: users.email_verified, isActive: users.is_active, suspensionReason: users.suspension_reason, suspendedAt: users.suspended_at, suspendedBy: users.suspended_by, createdAt: users.created_at, updatedAt: users.updated_at };
const auditStateUser = user => ({ id: user.id, role: user.role, isActive: user.isActive });
const missing = (type) => new AppError(404, `${type.toUpperCase()}_NOT_FOUND`, `${type} was not found`);

export const listAdminUsers = async ({ page, limit, q, role, status }) => {
  const filters = [];
  if (q) filters.push(or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)));
  if (role) filters.push(eq(users.role, role));
  if (status) filters.push(eq(users.is_active, status === 'active'));
  const where = filters.length ? and(...filters) : undefined;
  const [rows, counts] = await Promise.all([
    db.select(userFields).from(users).where(where).orderBy(desc(users.created_at), desc(users.id)).limit(limit).offset((page - 1) * limit),
    db.select({ count: sql`count(*)::int` }).from(users).where(where),
  ]);
  const total = counts[0]?.count ?? 0;
  return { users: rows, pagination: pageResult(page, limit, total) };
};

export const getAdminUser = async id => {
  const [user] = await db.select(userFields).from(users).where(eq(users.id, id)).limit(1);
  if (!user) throw missing('user');
  const [sessionCount] = await db.select({ count: sql`count(*)::int` }).from(authSessions).where(and(eq(authSessions.user_id, id), isNull(authSessions.revoked_at), gt(authSessions.expires_at, new Date())));
  return { user, activeSessionCount: sessionCount?.count ?? 0 };
};

const safeAuditReason = reason => reason == null ? null : String(reason).replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted email]').replace(/(password|passphrase|token|secret|api[_-]?key|authorization|cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]').replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted value]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted token]').slice(0, 2000);
const statementPayload = values => JSON.stringify(values);
const extractRows = result => Array.isArray(result) ? result : result?.rows ?? [];
const executeRows = async statement => extractRows(await db.execute(statement));

export const moderateUser = async (actorId, targetId, { action, reason }, requestId) => {
  if (actorId === targetId && action === 'suspend') throw new AppError(409, 'SELF_SUSPENSION_DENIED', 'Administrators cannot suspend themselves');
  const [current] = await db.select(userFields).from(users).where(eq(users.id, targetId)).limit(1);
  if (!current) throw missing('user');
  if (current.role === 'admin' && current.isActive && action === 'suspend') {
    const [admins] = await db.select({ count: sql`count(*)::int` }).from(users).where(and(eq(users.role, 'admin'), eq(users.is_active, true)));
    if (admins?.count <= 1) throw new AppError(409, 'LAST_ACTIVE_ADMIN', 'The last active administrator cannot be suspended');
  }
  const active = action === 'reactivate';
  const before = auditStateUser(current);
  const payload = statementPayload({ actorId, targetId, expectedIsActive: current.isActive, active, reason: safeAuditReason(reason), requestId, action: active ? 'user.reactivated' : 'user.suspended', before });
  const rows = await executeRows(sql`
    /* phase7:user-status */
    WITH args AS (SELECT ${payload}::jsonb AS value),
    active_admin_count AS MATERIALIZED (
      SELECT count(*)::int AS count FROM (
        SELECT id FROM users WHERE role = 'admin' AND is_active = true
        ORDER BY id FOR UPDATE
      ) AS locked_admins
    ),
    changed AS (
      UPDATE users AS target
      SET is_active = (args.value->>'active')::boolean,
          suspension_reason = CASE WHEN (args.value->>'active')::boolean THEN NULL ELSE args.value->>'reason' END,
          suspended_at = CASE WHEN (args.value->>'active')::boolean THEN NULL ELSE now() END,
          suspended_by = CASE WHEN (args.value->>'active')::boolean THEN NULL ELSE (args.value->>'actorId')::integer END,
          updated_at = now()
      FROM args CROSS JOIN active_admin_count
      WHERE target.id = (args.value->>'targetId')::integer
        AND target.is_active = (args.value->>'expectedIsActive')::boolean
        AND target.role = (args.value->'before'->>'role')::user_role
        AND (target.role <> 'admin' OR NOT target.is_active
          OR (args.value->>'active')::boolean OR active_admin_count.count > 1)
      RETURNING target.id, target.role, target.is_active
    ), revoked AS (
      UPDATE auth_sessions AS session SET revoked_at = now()
      FROM changed, args
      WHERE session.user_id = changed.id AND session.revoked_at IS NULL
        AND NOT (args.value->>'active')::boolean
      RETURNING session.id
    ), audited AS (
      INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason, before_state, after_state, request_id)
      SELECT (args.value->>'actorId')::integer, args.value->>'action', 'user', changed.id::text,
        args.value->>'reason', args.value->'before',
        jsonb_build_object('id', changed.id, 'role', changed.role, 'isActive', changed.is_active),
        args.value->>'requestId'
      FROM changed CROSS JOIN args
      RETURNING id AS audit_id
    )
    SELECT changed.id AS id, changed.role AS role, changed.is_active AS "isActive", audited.audit_id AS "auditId"
    FROM changed CROSS JOIN audited
  `);
  if (!rows.length) throw new AppError(409, 'USER_STATUS_CHANGED', 'User status changed; reload and try again');
  return getAdminUser(targetId);
};

export const changeUserRole = async (actorId, targetId, { role, reason }, requestId) => {
  if (actorId === targetId && role !== 'admin') throw new AppError(409, 'SELF_DEMOTION_DENIED', 'Administrators cannot demote themselves');
  const [current] = await db.select(userFields).from(users).where(eq(users.id, targetId)).limit(1);
  if (!current) throw missing('user');
  if (current.role === role) throw new AppError(409, 'ROLE_UNCHANGED', 'The user already has this role');
  if (current.role === 'admin' && current.isActive && role !== 'admin') {
    const [admins] = await db.select({ count: sql`count(*)::int` }).from(users).where(and(eq(users.role, 'admin'), eq(users.is_active, true)));
    if (admins?.count <= 1) throw new AppError(409, 'LAST_ACTIVE_ADMIN', 'The last active administrator cannot be demoted');
  }
  const before = auditStateUser(current);
  const action = role === 'admin' ? 'admin.created' : current.role === 'admin' ? 'admin.role_changed' : 'user.role_changed';
  const targetType = role === 'admin' || current.role === 'admin' ? 'admin' : 'user';
  const payload = statementPayload({ actorId, targetId, expectedRole: current.role, expectedIsActive: current.isActive, role, action, targetType, reason: safeAuditReason(reason), before, requestId });
  const rows = await executeRows(sql`
    /* phase7:user-role */
    WITH args AS (SELECT ${payload}::jsonb AS value),
    active_admin_count AS MATERIALIZED (
      SELECT count(*)::int AS count FROM (
        SELECT id FROM users WHERE role = 'admin' AND is_active = true
        ORDER BY id FOR UPDATE
      ) AS locked_admins
    ),
    changed AS (
      UPDATE users AS target SET role = (args.value->>'role')::user_role, updated_at = now()
      FROM args CROSS JOIN active_admin_count
      WHERE target.id = (args.value->>'targetId')::integer
        AND target.role = (args.value->>'expectedRole')::user_role
        AND target.is_active = (args.value->>'expectedIsActive')::boolean
        AND (target.role <> 'admin' OR NOT target.is_active
          OR args.value->>'role' = 'admin' OR active_admin_count.count > 1)
      RETURNING target.id, target.role, target.is_active
    ), revoked AS (
      UPDATE auth_sessions AS session SET revoked_at = now()
      FROM changed
      WHERE session.user_id = changed.id AND session.revoked_at IS NULL
      RETURNING session.id
    ), audited AS (
      INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason, before_state, after_state, request_id)
      SELECT (args.value->>'actorId')::integer, args.value->>'action', args.value->>'targetType', changed.id::text,
        args.value->>'reason', args.value->'before',
        jsonb_build_object('id', changed.id, 'role', changed.role, 'isActive', changed.is_active),
        args.value->>'requestId'
      FROM changed CROSS JOIN args
      RETURNING id AS audit_id
    )
    SELECT changed.id AS id, changed.role AS role, audited.audit_id AS "auditId"
    FROM changed CROSS JOIN audited
  `);
  if (!rows.length) throw new AppError(409, 'USER_ROLE_CHANGED', 'User role changed; reload and try again');
  return getAdminUser(targetId);
};

export const revokeUserSessions = async (actorId, targetId, reason, requestId) => {
  if (actorId === targetId) throw new AppError(409, 'SELF_SESSION_REVOCATION_DENIED', 'Use sign out to revoke the current administrator session');
  const [user] = await db.select({ id: users.id, role: users.role, isActive: users.is_active }).from(users).where(eq(users.id, targetId)).limit(1);
  if (!user) throw missing('user');
  const payload = statementPayload({ actorId, targetId, reason: safeAuditReason(reason), requestId });
  const rows = await executeRows(sql`
    /* phase7:session-revoke */
    WITH args AS (SELECT ${payload}::jsonb AS value),
    changed AS (
      UPDATE auth_sessions AS session SET revoked_at = now()
      FROM args
      WHERE session.user_id = (args.value->>'targetId')::integer AND session.revoked_at IS NULL
      RETURNING session.id
    ), audited AS (
      INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason, before_state, after_state, request_id)
      SELECT (args.value->>'actorId')::integer, 'user.sessions_revoked', 'user', args.value->>'targetId',
        args.value->>'reason', jsonb_build_object('activeSessions', (SELECT count(*) FROM changed)),
        jsonb_build_object('activeSessions', 0), args.value->>'requestId'
      FROM args WHERE EXISTS (SELECT 1 FROM changed)
      RETURNING id AS audit_id
    )
    SELECT (SELECT count(*)::integer FROM changed) AS "revokedCount",
           (SELECT count(*)::integer FROM audited) AS "auditCount"
  `);
  return { revokedCount: rows[0]?.revokedCount ?? 0 };
};

export const provisionAdditionalAdmin = async (actorId, email, reason, requestId) => {
  const [target] = await db.select(userFields).from(users).where(eq(users.email, email)).limit(1);
  if (!target) throw missing('user');
  if (!target.isActive) throw new AppError(409, 'ADMIN_TARGET_INACTIVE', 'Reactivate the user before granting administrator access');
  if (target.role === 'admin') throw new AppError(409, 'ALREADY_ADMIN', 'User is already an administrator');
  return changeUserRole(actorId, target.id, { role: 'admin', reason }, requestId);
};

export const listAuditLogs = async ({ page, limit, actorId, action, targetType, targetId }) => {
  const filters = [];
  if (actorId) filters.push(eq(adminAuditLogs.actor_id, actorId));
  if (action) filters.push(eq(adminAuditLogs.action, action));
  if (targetType) filters.push(eq(adminAuditLogs.target_type, targetType));
  if (targetId) filters.push(eq(adminAuditLogs.target_id, targetId));
  const where = filters.length ? and(...filters) : undefined;
  const [logs, counts] = await Promise.all([
    db.select({ id: adminAuditLogs.id, actorId: adminAuditLogs.actor_id, action: adminAuditLogs.action, targetType: adminAuditLogs.target_type, targetId: adminAuditLogs.target_id, reason: adminAuditLogs.reason, before: adminAuditLogs.before_state, after: adminAuditLogs.after_state, requestId: adminAuditLogs.request_id, createdAt: adminAuditLogs.created_at }).from(adminAuditLogs).where(where).orderBy(desc(adminAuditLogs.created_at), desc(adminAuditLogs.id)).limit(limit).offset((page - 1) * limit),
    db.select({ count: sql`count(*)::int` }).from(adminAuditLogs).where(where),
  ]);
  const total = counts[0]?.count ?? 0;
  return { auditLogs: logs, pagination: pageResult(page, limit, total) };
};

export const getAdminDashboard = async () => {
  const count = async (table, where) => {
    const [row] = await db.select({ count: sql`count(*)::int` }).from(table).where(where);
    return row?.count ?? 0;
  };
  const [totalUsers, activeUsers, suspendedUsers, buyers, sellers, totalListings, pendingListings, publishedListings, rejectedListings, suspendedListings, openReports, recentlyResolvedReports, recentActions] = await Promise.all([
    count(users), count(users, eq(users.is_active, true)), count(users, eq(users.is_active, false)), count(users, eq(users.role, 'buyer')), count(users, eq(users.role, 'seller')),
    count(businessListings), count(businessListings, eq(businessListings.status, 'pending')), count(businessListings, eq(businessListings.status, 'published')), count(businessListings, eq(businessListings.status, 'rejected')), count(businessListings, eq(businessListings.status, 'suspended')),
    count(moderationReports, or(eq(moderationReports.status, 'pending'), eq(moderationReports.status, 'under_review'))),
    count(moderationReports, and(or(eq(moderationReports.status, 'resolved'), eq(moderationReports.status, 'dismissed')), gte(moderationReports.resolved_at, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))),
    db.select({ id: adminAuditLogs.id, actorId: adminAuditLogs.actor_id, action: adminAuditLogs.action, targetType: adminAuditLogs.target_type, targetId: adminAuditLogs.target_id, createdAt: adminAuditLogs.created_at }).from(adminAuditLogs).orderBy(desc(adminAuditLogs.created_at), desc(adminAuditLogs.id)).limit(10),
  ]);
  return { users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers, buyers, sellers }, listings: { total: totalListings, pending: pendingListings, published: publishedListings, rejected: rejectedListings, suspended: suspendedListings }, reports: { open: openReports, recentlyResolved: recentlyResolvedReports }, recentActions };
};

export const listAdminListings = async ({ page, limit, status, q }) => {
  const filters = [];
  if (status) filters.push(eq(businessListings.status, status));
  if (q) filters.push(or(ilike(businessListings.title, `%${q}%`), ilike(businessListings.description, `%${q}%`)));
  const where = filters.length ? and(...filters) : undefined;
  const [rows, counts] = await Promise.all([
    db.select({ id: businessListings.id, sellerId: businessListings.seller_id, title: businessListings.title, description: businessListings.description, industry: businessListings.industry, location: businessListings.location, status: businessListings.status, moderationReason: businessListings.moderation_reason, moderatedBy: businessListings.moderated_by, moderatedAt: businessListings.moderated_at, createdAt: businessListings.created_at, updatedAt: businessListings.updated_at }).from(businessListings).where(where).orderBy(desc(businessListings.created_at), desc(businessListings.id)).limit(limit).offset((page - 1) * limit),
    db.select({ count: sql`count(*)::int` }).from(businessListings).where(where),
  ]);
  const total = counts[0]?.count ?? 0;
  return { listings: rows, pagination: pageResult(page, limit, total) };
};

export const moderateListingAdmin = async (actorId, id, input, requestId) => {
  const [current] = await db.select({ id: businessListings.id, status: businessListings.status, title: businessListings.title, moderatedBy: businessListings.moderated_by, moderationReason: businessListings.moderation_reason }).from(businessListings).where(eq(businessListings.id, id)).limit(1);
  if (!current) throw missing('listing');
  const nextStatus = input.action === 'approve' ? 'published' : 'rejected';
  if (current.status !== 'pending') throw new AppError(409, 'INVALID_LISTING_STATUS', 'Only pending listings can be moderated');
  const before = { status: current.status, moderatedBy: current.moderatedBy };
  const action = input.action === 'approve' ? 'listing.approved' : 'listing.rejected';
  const reason = input.rejectionReason ?? 'Approved after moderation review';
  const payload = statementPayload({ actorId, id, expectedStatus: 'pending', status: nextStatus, action, reason: safeAuditReason(reason), before, requestId });
  const rows = await executeRows(sql`
    /* phase7:listing-moderation */
    WITH args AS (SELECT ${payload}::jsonb AS value),
    changed AS (
      UPDATE business_listings AS listing
      SET status = (args.value->>'status')::listing_status,
          published_at = CASE WHEN args.value->>'status' = 'published' THEN now() ELSE NULL END,
          rejection_reason = CASE WHEN args.value->>'status' = 'rejected' THEN args.value->>'reason' ELSE NULL END,
          moderation_reason = CASE WHEN args.value->>'status' = 'rejected' THEN args.value->>'reason' ELSE NULL END,
          moderated_by = (args.value->>'actorId')::integer, moderated_at = now(), updated_at = now()
      FROM args
      WHERE listing.id = (args.value->>'id')::integer AND listing.status = (args.value->>'expectedStatus')::listing_status
        AND listing.moderated_by IS NOT DISTINCT FROM (args.value->'before'->>'moderatedBy')::integer
      RETURNING listing.id, listing.status, listing.title, listing.published_at, listing.rejection_reason,
        listing.moderation_reason, listing.moderated_by, listing.moderated_at
    ), audited AS (
      INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason, before_state, after_state, request_id)
      SELECT (args.value->>'actorId')::integer, args.value->>'action', 'listing', changed.id::text,
        args.value->>'reason', args.value->'before',
        jsonb_build_object('status', changed.status, 'moderatedBy', changed.moderated_by), args.value->>'requestId'
      FROM changed CROSS JOIN args
      RETURNING id AS audit_id
    )
    SELECT changed.id AS id, changed.status AS status, changed.title AS title, changed.published_at AS "publishedAt",
      changed.rejection_reason AS "rejectionReason", changed.moderation_reason AS "moderationReason",
      changed.moderated_by AS "moderatedBy", changed.moderated_at AS "moderatedAt", audited.audit_id AS "auditId"
    FROM changed CROSS JOIN audited
  `);
  const [updated] = rows;
  if (!updated) throw new AppError(409, 'INVALID_LISTING_STATUS', 'Listing status changed; reload and try again');
  return updated;
};

export const changeListingAvailability = async (actorId, id, action, reason, requestId) => {
  const expected = action === 'suspend' ? 'published' : 'suspended';
  const status = action === 'suspend' ? 'suspended' : 'published';
  const [current] = await db.select({ id: businessListings.id, status: businessListings.status, moderatedBy: businessListings.moderated_by, moderationReason: businessListings.moderation_reason }).from(businessListings).where(eq(businessListings.id, id)).limit(1);
  if (!current) throw missing('listing');
  if (current.status !== expected) throw new AppError(409, 'INVALID_LISTING_STATUS', `Only ${expected} listings can be ${action}d`);
  const before = { status: current.status, moderatedBy: current.moderatedBy };
  const eventType = action === 'suspend' ? 'listing.suspended' : 'listing.restored';
  const payload = statementPayload({ actorId, id, expectedStatus: expected, status, action: eventType, eventType, reason: safeAuditReason(reason), before, requestId });
  const rows = await executeRows(sql`
    /* phase7:listing-availability */
    WITH args AS (SELECT ${payload}::jsonb AS value),
    changed AS (
      UPDATE business_listings AS listing
      SET status = (args.value->>'status')::listing_status, moderation_reason = args.value->>'reason',
          moderated_by = (args.value->>'actorId')::integer, moderated_at = now(),
          suspended_by = CASE WHEN args.value->>'status' = 'suspended' THEN (args.value->>'actorId')::integer ELSE NULL END,
          suspended_at = CASE WHEN args.value->>'status' = 'suspended' THEN now() ELSE NULL END,
          published_at = CASE WHEN args.value->>'status' = 'published' THEN now() ELSE listing.published_at END,
          updated_at = now()
      FROM args
      WHERE listing.id = (args.value->>'id')::integer AND listing.status = (args.value->>'expectedStatus')::listing_status
        AND listing.moderated_by IS NOT DISTINCT FROM (args.value->'before'->>'moderatedBy')::integer
      RETURNING listing.id, listing.status, listing.moderated_by, listing.moderated_at
    ), audited AS (
      INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason, before_state, after_state, request_id)
      SELECT (args.value->>'actorId')::integer, args.value->>'eventType', 'listing', changed.id::text,
        args.value->>'reason', args.value->'before',
        jsonb_build_object('status', changed.status, 'moderatedBy', changed.moderated_by), args.value->>'requestId'
      FROM changed CROSS JOIN args
      RETURNING id AS audit_id
    )
    SELECT changed.id AS id, changed.status AS status, changed.moderated_by AS "moderatedBy",
      changed.moderated_at AS "moderatedAt", audited.audit_id AS "auditId"
    FROM changed CROSS JOIN audited
  `);
  const [updated] = rows;
  if (!updated) throw new AppError(409, 'INVALID_LISTING_STATUS', 'Listing status changed; reload and try again');
  return updated;
};

export const getListingModerationHistory = async listingId => listAuditLogs({ page: 1, limit: 100, targetType: 'listing', targetId: String(listingId) });

export const createReport = async (reporterId, input) => {
  if (input.reportedUserId === reporterId) throw new AppError(400, 'SELF_REPORT_DENIED', 'You cannot report your own account');
  if (input.listingId) {
    const [listing] = await db.select({ id: businessListings.id }).from(businessListings).where(eq(businessListings.id, input.listingId)).limit(1);
    if (!listing) throw missing('listing');
  } else {
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.reportedUserId)).limit(1);
    if (!target) throw missing('user');
  }
  const filters = [eq(moderationReports.reporter_id, reporterId), eq(moderationReports.category, input.category), or(eq(moderationReports.status, 'pending'), eq(moderationReports.status, 'under_review'))];
  filters.push(input.listingId ? eq(moderationReports.listing_id, input.listingId) : eq(moderationReports.reported_user_id, input.reportedUserId));
  const [duplicate] = await db.select({ id: moderationReports.id }).from(moderationReports).where(and(...filters)).limit(1);
  if (duplicate) return { report: { id: duplicate.id, duplicate: true }, created: false };
  const [row] = await db.insert(moderationReports).values({ reporter_id: reporterId, listing_id: input.listingId ?? null, reported_user_id: input.reportedUserId ?? null, category: input.category, description: input.description }).returning({ id: moderationReports.id, status: moderationReports.status, category: moderationReports.category, createdAt: moderationReports.created_at });
  return { report: row, created: true };
};

export const listOwnReports = async (userId, { page, limit }) => {
  const [rows, counts] = await Promise.all([
    db.select({ id: moderationReports.id, listingId: moderationReports.listing_id, reportedUserId: moderationReports.reported_user_id, category: moderationReports.category, description: moderationReports.description, status: moderationReports.status, createdAt: moderationReports.created_at, resolvedAt: moderationReports.resolved_at }).from(moderationReports).where(eq(moderationReports.reporter_id, userId)).orderBy(desc(moderationReports.created_at), desc(moderationReports.id)).limit(limit).offset((page - 1) * limit),
    db.select({ count: sql`count(*)::int` }).from(moderationReports).where(eq(moderationReports.reporter_id, userId)),
  ]);
  const total = counts[0]?.count ?? 0;
  return { reports: rows, pagination: pageResult(page, limit, total) };
};

export const listModerationReports = async ({ page, limit, status, category, q }) => {
  const filters = [];
  if (status) filters.push(eq(moderationReports.status, status));
  if (category) filters.push(eq(moderationReports.category, category));
  if (q) filters.push(ilike(moderationReports.description, `%${q}%`));
  const where = filters.length ? and(...filters) : undefined;
  const [rows, counts] = await Promise.all([
    db.select({ id: moderationReports.id, reporterId: moderationReports.reporter_id, listingId: moderationReports.listing_id, reportedUserId: moderationReports.reported_user_id, category: moderationReports.category, description: moderationReports.description, status: moderationReports.status, moderatorNotes: moderationReports.moderator_notes, resolutionReason: moderationReports.resolution_reason, assignedTo: moderationReports.assigned_to, resolvedBy: moderationReports.resolved_by, createdAt: moderationReports.created_at, resolvedAt: moderationReports.resolved_at }).from(moderationReports).where(where).orderBy(desc(moderationReports.created_at), desc(moderationReports.id)).limit(limit).offset((page - 1) * limit),
    db.select({ count: sql`count(*)::int` }).from(moderationReports).where(where),
  ]);
  const total = counts[0]?.count ?? 0;
  return { reports: rows, pagination: pageResult(page, limit, total) };
};

export const updateModerationReport = async (actorId, id, input, requestId) => {
  const [current] = await db.select({ id: moderationReports.id, status: moderationReports.status, moderatorNotes: moderationReports.moderator_notes, assignedTo: moderationReports.assigned_to, resolvedBy: moderationReports.resolved_by }).from(moderationReports).where(eq(moderationReports.id, id)).limit(1);
  if (!current) throw missing('report');
  if (['resolved', 'dismissed'].includes(current.status)) throw new AppError(409, 'REPORT_ALREADY_CLOSED', 'This report is already closed');
  const before = { status: current.status, assignedTo: current.assignedTo, resolvedBy: current.resolvedBy };
  const payload = statementPayload({ actorId, id, expectedStatus: current.status, status: input.status, reason: safeAuditReason(input.reason), moderatorNotes: input.moderatorNotes ?? current.moderatorNotes, before, requestId });
  const rows = await executeRows(sql`
    /* phase7:report-status */
    WITH args AS (SELECT ${payload}::jsonb AS value),
    changed AS (
      UPDATE moderation_reports AS report
      SET status = args.value->>'status', moderator_notes = args.value->>'moderatorNotes',
          resolution_reason = CASE WHEN args.value->>'status' IN ('resolved', 'dismissed') THEN args.value->>'reason' ELSE NULL END,
          assigned_to = (args.value->>'actorId')::integer,
          resolved_by = CASE WHEN args.value->>'status' IN ('resolved', 'dismissed') THEN (args.value->>'actorId')::integer ELSE NULL END,
          resolved_at = CASE WHEN args.value->>'status' IN ('resolved', 'dismissed') THEN now() ELSE NULL END,
          updated_at = now()
      FROM args
      WHERE report.id = (args.value->>'id')::integer AND report.status = args.value->>'expectedStatus'
        AND report.assigned_to IS NOT DISTINCT FROM (args.value->'before'->>'assignedTo')::integer
        AND report.resolved_by IS NOT DISTINCT FROM (args.value->'before'->>'resolvedBy')::integer
      RETURNING report.id, report.status, report.assigned_to, report.resolved_by, report.resolved_at
    ), audited AS (
      INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, reason, before_state, after_state, request_id)
      SELECT (args.value->>'actorId')::integer, 'report.' || changed.status, 'report', changed.id::text,
        args.value->>'reason', args.value->'before',
        jsonb_build_object('status', changed.status, 'assignedTo', changed.assigned_to, 'resolvedBy', changed.resolved_by),
        args.value->>'requestId'
      FROM changed CROSS JOIN args
      RETURNING id AS audit_id
    )
    SELECT changed.id AS id, changed.status AS status, changed.assigned_to AS "assignedTo",
      changed.resolved_by AS "resolvedBy", changed.resolved_at AS "resolvedAt", audited.audit_id AS "auditId"
    FROM changed CROSS JOIN audited
  `);
  const [updated] = rows;
  if (!updated) throw new AppError(409, 'REPORT_STATUS_CHANGED', 'Report status changed; reload and try again');
  return updated;
};
