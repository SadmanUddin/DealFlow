import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.TEST_DATABASE_URL = 'postgresql://localhost:5432/dealflow_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-chars';
process.env.ARCJET_KEY = 'test-only-arcjet-key';

vi.mock('../src/config/database.js', async () => ({
  db: (await import('./helpers/mock-database.js')).db,
}));
vi.mock(
  '../src/models/user.model.js',
  async () => (await import('./helpers/mock-database.js')).modelTables
);
vi.mock('../src/models/listing.model.js', async () => ({
  businessListings: (await import('./helpers/mock-database.js')).modelTables
    .businessListings,
}));
vi.mock('../src/models/admin.model.js', async () => {
  const { modelTables } = await import('./helpers/mock-database.js');
  return {
    moderationReports: modelTables.moderationReports,
    adminAuditLogs: modelTables.adminAuditLogs,
  };
});
vi.mock('../src/config/arcjet.js', () => {
  const client = {
    withRule: () => client,
    protect: async () => ({ isDenied: () => false }),
  };
  return { default: client };
});
vi.mock('../src/config/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock(
  'drizzle-orm',
  async () => (await import('./helpers/mock-database.js')).drizzleOperators
);

const [{ default: app }, mock] = await Promise.all([
  import('../src/app.js'),
  import('./helpers/mock-database.js'),
]);
const authSecret = process.env.JWT_SECRET;
const identities = {
  buyer: {
    id: 1,
    name: 'Buyer User',
    email: 'buyer@phase7.test',
    role: 'buyer',
  },
  seller: {
    id: 2,
    name: 'Seller User',
    email: 'seller@phase7.test',
    role: 'seller',
  },
  admin: {
    id: 3,
    name: 'Admin User',
    email: 'admin@phase7.test',
    role: 'admin',
  },
  other: {
    id: 4,
    name: 'Other User',
    email: 'other@phase7.test',
    role: 'buyer',
  },
};
const csrf = 'phase7-test-csrf-token';
const cookieFor = id => {
  const sessionId = `phase7-session-${id}`;
  const token = jwt.sign({ sid: sessionId }, authSecret, {
    algorithm: 'HS256',
    subject: String(id),
    issuer: 'dealflow-api',
    audience: 'dealflow-client',
    expiresIn: '10m',
  });
  return { cookie: `token=${token}`, csrf };
};
const signed = (builder, credentials) =>
  builder
    .set('Cookie', credentials.cookie)
    .set('X-CSRF-Token', credentials.csrf);

beforeEach(() => {
  mock.resetDatabase();
  const now = new Date();
  for (const user of Object.values(identities))
    mock.databaseState.users.push({
      ...user,
      password: 'NEVER_RETURN_THIS_HASH',
      email_verified: true,
      is_active: true,
      suspension_reason: null,
      suspended_at: null,
      suspended_by: null,
      created_at: now,
      updated_at: now,
    });
  for (const user of Object.values(identities))
    mock.databaseState.auth_sessions.push({
      id: `phase7-session-${user.id}`,
      user_id: user.id,
      csrf_token_hash: createHash('sha256').update(csrf).digest('hex'),
      expires_at: new Date(Date.now() + 600000),
      revoked_at: null,
      created_at: now,
    });
});

describe('Phase 7 authorization and user moderation', () => {
  it('denies unauthenticated, buyer, and seller access and permits admins', async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/admin/users')
          .set('Cookie', cookieFor(1).cookie)
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/admin/users')
          .set('Cookie', cookieFor(2).cookie)
      ).status
    ).toBe(403);
    const response = await request(app)
      .get('/api/admin/users')
      .set('Cookie', cookieFor(3).cookie);
    expect(response.status).toBe(200);
    expect(response.body.users[0]).not.toHaveProperty('password');
  });

  it('validates pagination/search and lists users without secrets', async () => {
    const response = await request(app)
      .get('/api/admin/users?q=Buyer&role=buyer&status=active&limit=10')
      .set('Cookie', cookieFor(3).cookie);
    expect(response.body.users.map(row => row.email)).toEqual([
      'buyer@phase7.test',
    ]);
    expect(
      (
        await request(app)
          .get('/api/admin/users?limit=101')
          .set('Cookie', cookieFor(3).cookie)
      ).status
    ).toBe(400);
    expect(response.body.users[0]).not.toHaveProperty('passwordHash');
  });

  it('suspends/reactivates accounts, revokes sessions, and blocks self-suspension', async () => {
    const suspended = await signed(
      request(app).patch('/api/admin/users/1/status'),
      cookieFor(3)
    ).send({ action: 'suspend', reason: 'Suspected account compromise' });
    expect(suspended.status).toBe(200);
    expect(
      mock.databaseState.auth_sessions.find(row => row.user_id === 1).revoked_at
    ).toBeTruthy();
    expect(
      (
        await request(app)
          .get('/api/auth/me')
          .set('Cookie', cookieFor(1).cookie)
      ).status
    ).toBe(401);
    const reactivated = await signed(
      request(app).patch('/api/admin/users/1/status'),
      cookieFor(3)
    ).send({ action: 'reactivate', reason: 'Identity review completed' });
    expect(reactivated.status).toBe(200);
    expect(mock.databaseState.users.find(row => row.id === 1).is_active).toBe(
      true
    );
    expect(
      (
        await signed(
          request(app).patch('/api/admin/users/3/status'),
          cookieFor(3)
        ).send({ action: 'suspend', reason: 'Suspension test' })
      ).body.error.code
    ).toBe('SELF_SUSPENSION_DENIED');
    expect(mock.databaseState.admin_audit_logs.map(row => row.action)).toEqual([
      'user.suspended',
      'user.reactivated',
    ]);
  });

  it('rolls back user/session changes if the paired audit insert fails', async () => {
    mock.databaseState.failNext = new Error('simulated audit write failure');
    mock.databaseState.failOn = {
      table: 'admin_audit_logs',
      operation: 'insert',
    };
    const response = await signed(
      request(app).patch('/api/admin/users/1/status'),
      cookieFor(3)
    ).send({ action: 'suspend', reason: 'Credential exposure reported' });
    expect(response.status).toBe(500);
    expect(mock.databaseState.users.find(row => row.id === 1).is_active).toBe(
      true
    );
    expect(
      mock.databaseState.auth_sessions.find(row => row.user_id === 1).revoked_at
    ).toBeNull();
    expect(mock.databaseState.admin_audit_logs).toHaveLength(0);
  });

  it('protects the last active admin and blocks self-demotion', async () => {
    const { moderateUser, changeUserRole } =
      await import('../src/services/admin.service.js');
    await expect(
      moderateUser(999, 3, { action: 'suspend', reason: 'test reason' }, 'req')
    ).rejects.toMatchObject({ code: 'LAST_ACTIVE_ADMIN' });
    await expect(
      changeUserRole(3, 3, { role: 'buyer', reason: 'test reason' }, 'req')
    ).rejects.toMatchObject({ code: 'SELF_DEMOTION_DENIED' });
  });

  it('rechecks the active-admin minimum in the conditional write after a concurrent admin suspension', async () => {
    const { moderateUser } = await import('../src/services/admin.service.js');
    mock.databaseState.users.push({
      id: 5,
      name: 'Second Admin',
      email: 'second-admin@phase7.test',
      password: 'hash',
      role: 'admin',
      email_verified: true,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    mock.databaseState.staleNext = {
      table: 'users',
      id: 3,
      anyTarget: true,
      patch: { is_active: false },
    };

    await expect(
      moderateUser(
        3,
        5,
        { action: 'suspend', reason: 'Admin review' },
        'req-race'
      )
    ).rejects.toMatchObject({ status: 409, code: 'USER_STATUS_CHANGED' });
    expect(mock.databaseState.users.find(row => row.id === 5).is_active).toBe(
      true
    );
    expect(mock.databaseState.admin_audit_logs).toHaveLength(0);
  });

  it('does not audit stale user status or role updates that return no row', async () => {
    mock.databaseState.staleNext = {
      table: 'users',
      id: 1,
      patch: { is_active: false },
    };
    const suspension = await signed(
      request(app).patch('/api/admin/users/1/status'),
      cookieFor(3)
    ).send({ action: 'suspend', reason: 'Stale state test' });
    expect(suspension.status).toBe(409);
    expect(mock.databaseState.admin_audit_logs).toHaveLength(0);

    mock.databaseState.staleNext = {
      table: 'users',
      id: 4,
      patch: { role: 'seller' },
    };
    const { changeUserRole } = await import('../src/services/admin.service.js');
    await expect(
      changeUserRole(
        3,
        4,
        { role: 'seller', reason: 'Stale role test' },
        'request-1'
      )
    ).rejects.toMatchObject({ code: 'USER_ROLE_CHANGED' });
    expect(mock.databaseState.admin_audit_logs).toHaveLength(0);
  });

  it('rolls back role changes, listing decisions, and report updates when audit insertion fails', async () => {
    const { changeUserRole, moderateListingAdmin, updateModerationReport } =
      await import('../src/services/admin.service.js');
    mock.databaseState.failNext = new Error('simulated audit insert failure');
    mock.databaseState.failOn = {
      table: 'admin_audit_logs',
      operation: 'insert',
    };
    await expect(
      changeUserRole(
        3,
        4,
        { role: 'seller', reason: 'Role failure test' },
        'request'
      )
    ).rejects.toThrow();
    expect(mock.databaseState.users.find(row => row.id === 4).role).toBe(
      'buyer'
    );
    expect(mock.databaseState.admin_audit_logs).toHaveLength(0);

    mock.databaseState.business_listings.push({
      id: 10,
      seller_id: 2,
      title: 'Pending audit failure listing',
      description: 'A sufficiently detailed listing description.',
      status: 'pending',
      moderated_by: null,
      moderation_reason: null,
      rejection_reason: null,
      published_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    mock.databaseState.failNext = new Error('simulated audit insert failure');
    mock.databaseState.failOn = {
      table: 'admin_audit_logs',
      operation: 'insert',
    };
    await expect(
      moderateListingAdmin(3, 10, { action: 'approve' }, 'request')
    ).rejects.toThrow();
    expect(mock.databaseState.business_listings[0].status).toBe('pending');
    expect(mock.databaseState.admin_audit_logs).toHaveLength(0);

    mock.databaseState.moderation_reports.push({
      id: 5,
      reporter_id: 1,
      reported_user_id: 2,
      listing_id: null,
      category: 'other',
      description: 'Audit failure report fixture.',
      status: 'pending',
      created_at: new Date(),
    });
    mock.databaseState.failNext = new Error('simulated audit insert failure');
    mock.databaseState.failOn = {
      table: 'admin_audit_logs',
      operation: 'insert',
    };
    await expect(
      updateModerationReport(
        3,
        5,
        { status: 'resolved', reason: 'Resolution failure test' },
        'request'
      )
    ).rejects.toThrow();
    expect(mock.databaseState.moderation_reports[0].status).toBe('pending');
    expect(mock.databaseState.admin_audit_logs).toHaveLength(0);
  });

  it('provisions an existing account as admin only through an admin endpoint', async () => {
    expect(
      (
        await request(app).post('/api/admin/admins').send({
          email: identities.other.email,
          reason: 'Trusted staff member',
        })
      ).status
    ).toBe(401);
    const response = await signed(
      request(app).post('/api/admin/admins'),
      cookieFor(3)
    ).send({ email: identities.other.email, reason: 'Trusted staff member' });
    expect(response.status).toBe(201);
    expect(mock.databaseState.users.find(row => row.id === 4).role).toBe(
      'admin'
    );
    expect(
      mock.databaseState.auth_sessions.find(row => row.user_id === 4).revoked_at
    ).toBeTruthy();
    expect(mock.databaseState.admin_audit_logs.at(-1)).toMatchObject({
      actor_id: 3,
      action: 'admin.created',
      target_type: 'admin',
      target_id: '4',
    });
  });

  it('revokes sessions through the admin action and audits without token data', async () => {
    const response = await signed(
      request(app).post('/api/admin/users/2/revoke-sessions'),
      cookieFor(3)
    ).send({
      reason: 'Security review for private@example.test; password=do-not-store',
    });
    expect(response.body.revokedCount).toBe(1);
    expect(mock.databaseState.admin_audit_logs.at(-1).after_state).toEqual({
      activeSessions: 0,
    });
    expect(JSON.stringify(mock.databaseState.admin_audit_logs)).not.toContain(
      'NEVER_RETURN_THIS_HASH'
    );
    expect(JSON.stringify(mock.databaseState.admin_audit_logs)).not.toContain(
      'private@example.test'
    );
    expect(JSON.stringify(mock.databaseState.admin_audit_logs)).not.toContain(
      'do-not-store'
    );
    expect(
      (
        await signed(
          request(app).post('/api/admin/users/3/revoke-sessions'),
          cookieFor(3)
        ).send({ reason: 'Do not lock self out' })
      ).body.error.code
    ).toBe('SELF_SESSION_REVOCATION_DENIED');
  });

  it('audits a generation advance even if no stored sessions remain', async () => {
    const credentials = cookieFor(3);
    const first = await signed(
      request(app).post('/api/admin/users/2/revoke-sessions'),
      credentials
    ).send({ reason: 'Revoke active sessions' });
    const second = await signed(
      request(app).post('/api/admin/users/2/revoke-sessions'),
      credentials
    ).send({ reason: 'Repeat revocation' });
    expect(first.body.revokedCount).toBe(1);
    expect(second.body.revokedCount).toBe(0);
    expect(
      mock.databaseState.admin_audit_logs.filter(
        row => row.action === 'user.sessions_revoked'
      )
    ).toHaveLength(2);
  });
});

describe('Phase 7 listing moderation and audit', () => {
  const createListing = (status, id = 10) => {
    const row = {
      id,
      seller_id: 2,
      title: 'Phase 7 business',
      description: 'Business description with enough detail.',
      industry: 'Retail',
      location: 'Brussels',
      status,
      moderation_reason: null,
      moderated_by: null,
      moderated_at: null,
      rejection_reason: null,
      published_at: status === 'published' ? new Date() : null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    mock.databaseState.business_listings.push(row);
    return row;
  };

  it('approves and rejects pending listings with actor, reason, and audit state', async () => {
    createListing('pending');
    const approved = await signed(
      request(app).patch('/api/admin/listings/10/moderation'),
      cookieFor(3)
    ).send({ action: 'approve' });
    expect(approved.status).toBe(200);
    expect(mock.databaseState.business_listings[0]).toMatchObject({
      status: 'published',
      moderated_by: 3,
    });
    createListing('pending', 11);
    const rejected = await signed(
      request(app).patch('/api/admin/listings/11/moderation'),
      cookieFor(3)
    ).send({ action: 'reject', rejectionReason: 'Insufficient evidence' });
    expect(rejected.status).toBe(200);
    expect(mock.databaseState.admin_audit_logs.map(row => row.action)).toEqual([
      'listing.approved',
      'listing.rejected',
    ]);
    expect(mock.databaseState.admin_audit_logs[1]).toMatchObject({
      actor_id: 3,
      reason: 'Insufficient evidence',
      before_state: { status: 'pending', moderatedBy: null },
    });
  });

  it('requires rejection reasons and enforces moderation transitions', async () => {
    createListing('pending');
    expect(
      (
        await signed(
          request(app).patch('/api/admin/listings/10/moderation'),
          cookieFor(3)
        ).send({ action: 'reject' })
      ).status
    ).toBe(400);
    expect(
      (
        await signed(
          request(app).patch('/api/admin/listings/10/moderation'),
          cookieFor(3)
        ).send({ action: 'approve' })
      ).status
    ).toBe(200);
    expect(
      (
        await signed(
          request(app).patch('/api/admin/listings/10/moderation'),
          cookieFor(3)
        ).send({ action: 'approve' })
      ).status
    ).toBe(409);
  });

  it('suspends and restores published listings without deleting related history', async () => {
    createListing('published');
    mock.databaseState.conversations.push({
      id: 9,
      listing_id: 10,
      buyer_id: 1,
      seller_id: 2,
      status: 'pending',
      created_at: new Date(),
    });
    const suspended = await signed(
      request(app).patch('/api/admin/listings/10/status'),
      cookieFor(3)
    ).send({ action: 'suspend', reason: 'Marketplace policy concern' });
    expect(suspended.body.listing.status).toBe('suspended');
    const restored = await signed(
      request(app).patch('/api/admin/listings/10/status'),
      cookieFor(3)
    ).send({ action: 'restore', reason: 'Issue resolved' });
    expect(restored.body.listing.status).toBe('published');
    expect(mock.databaseState.conversations).toHaveLength(1);
    expect(mock.databaseState.admin_audit_logs.map(row => row.action)).toEqual([
      'listing.suspended',
      'listing.restored',
    ]);
  });

  it('does not audit stale listing moderation when its conditional update returns no row', async () => {
    createListing('pending');
    mock.databaseState.staleNext = {
      table: 'business_listings',
      id: 10,
      patch: { status: 'published' },
    };
    const response = await signed(
      request(app).patch('/api/admin/listings/10/moderation'),
      cookieFor(3)
    ).send({ action: 'approve' });
    expect(response.status).toBe(409);
    expect(mock.databaseState.admin_audit_logs).toHaveLength(0);
  });

  it('does not audit stale listing suspension or restoration when status has changed', async () => {
    createListing('published');
    mock.databaseState.staleNext = {
      table: 'business_listings',
      id: 10,
      patch: { status: 'suspended' },
    };
    const response = await signed(
      request(app).patch('/api/admin/listings/10/status'),
      cookieFor(3)
    ).send({ action: 'suspend', reason: 'Concurrent moderation test' });
    expect(response.status).toBe(409);
    expect(mock.databaseState.admin_audit_logs).toHaveLength(0);
  });
});

describe('Phase 7 user reports', () => {
  it('validates reports, deduplicates open reports, and isolates reporter history', async () => {
    mock.databaseState.business_listings.push({
      id: 20,
      seller_id: 2,
      title: 'Reported listing',
      description: 'A sufficiently detailed description',
      status: 'published',
      created_at: new Date(),
    });
    const report = await signed(
      request(app).post('/api/reports'),
      cookieFor(1)
    ).send({
      listingId: 20,
      category: 'potential_scam',
      description: 'This listing contains contradictory claims.',
    });
    expect(report.status).toBe(201);
    const duplicate = await signed(
      request(app).post('/api/reports'),
      cookieFor(1)
    ).send({
      listingId: 20,
      category: 'potential_scam',
      description: 'A second description for same issue.',
    });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.created).toBe(false);
    expect(
      (
        await signed(request(app).post('/api/reports'), cookieFor(1)).send({
          listingId: 20,
          reportedUserId: 2,
          category: 'other',
          description: 'Both targets are invalid.',
        })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .get('/api/reports')
          .set('Cookie', cookieFor(4).cookie)
      ).body.reports
    ).toHaveLength(0);
    expect(
      (
        await request(app)
          .get('/api/reports')
          .set('Cookie', cookieFor(1).cookie)
      ).body.reports
    ).toHaveLength(1);
  });

  it('lets admins review, resolve, dismiss, and audit reports', async () => {
    const created = await signed(
      request(app).post('/api/reports'),
      cookieFor(1)
    ).send({
      reportedUserId: 2,
      category: 'suspicious_activity',
      description: 'User requested off-platform payment details.',
    });
    const reportId = created.body.report.id;
    expect(
      (
        await request(app)
          .get('/api/admin/reports')
          .set('Cookie', cookieFor(1).cookie)
      ).status
    ).toBe(403);
    const review = await signed(
      request(app).patch(`/api/admin/reports/${reportId}`),
      cookieFor(3)
    ).send({
      status: 'under_review',
      reason: 'Assigned for review',
      moderatorNotes: 'Review account history.',
    });
    expect(review.body.report?.assignedTo, JSON.stringify(review.body)).toBe(3);
    const resolved = await signed(
      request(app).patch(`/api/admin/reports/${reportId}`),
      cookieFor(3)
    ).send({ status: 'resolved', reason: 'Policy violation confirmed.' });
    expect(resolved.status).toBe(200);
    expect(mock.databaseState.admin_audit_logs.map(row => row.action)).toEqual([
      'report.under_review',
      'report.resolved',
    ]);
    expect(
      (
        await signed(
          request(app).patch(`/api/admin/reports/${reportId}`),
          cookieFor(3)
        ).send({ status: 'dismissed', reason: 'Too late' })
      ).status
    ).toBe(409);
  });

  it('does not audit stale report resolution when its conditional update returns no row', async () => {
    mock.databaseState.moderation_reports.push({
      id: 8,
      reporter_id: 1,
      reported_user_id: 2,
      listing_id: null,
      category: 'other',
      description: 'A report for stale state testing.',
      status: 'pending',
      created_at: new Date(),
    });
    mock.databaseState.staleNext = {
      table: 'moderation_reports',
      id: 8,
      patch: { status: 'under_review' },
    };
    const { updateModerationReport } =
      await import('../src/services/admin.service.js');
    await expect(
      updateModerationReport(
        3,
        8,
        { status: 'resolved', reason: 'Stale report test' },
        'request-2'
      )
    ).rejects.toMatchObject({ code: 'REPORT_STATUS_CHANGED' });
    expect(mock.databaseState.admin_audit_logs).toHaveLength(0);
  });
});

describe('Phase 7 dashboard and audit APIs', () => {
  it('returns accurate aggregate statistics and recent actions to admins only', async () => {
    mock.databaseState.business_listings.push(
      { id: 1, status: 'pending' },
      { id: 2, status: 'published' },
      { id: 3, status: 'suspended' }
    );
    mock.databaseState.moderation_reports.push(
      { id: 1, status: 'pending' },
      { id: 2, status: 'resolved', resolved_at: new Date() }
    );
    const response = await request(app)
      .get('/api/admin/dashboard')
      .set('Cookie', cookieFor(3).cookie);
    expect(response.status).toBe(200);
    expect(response.body.users).toMatchObject({
      total: 4,
      active: 4,
      suspended: 0,
      buyers: 2,
      sellers: 1,
    });
    expect(response.body.listings).toMatchObject({
      total: 3,
      pending: 1,
      published: 1,
      suspended: 1,
    });
    expect(response.body.reports.open).toBe(1);
    expect(
      (
        await request(app)
          .get('/api/admin/dashboard')
          .set('Cookie', cookieFor(1).cookie)
      ).status
    ).toBe(403);
  });

  it('restricts and paginates audit history and exposes no write/delete API', async () => {
    mock.databaseState.admin_audit_logs.push({
      id: 1,
      actor_id: 3,
      action: 'user.suspended',
      target_type: 'user',
      target_id: '1',
      reason: 'Reason',
      before_state: { isActive: true },
      after_state: { isActive: false },
      request_id: 'request-1',
      created_at: new Date(),
    });
    const response = await request(app)
      .get('/api/admin/audit-logs?targetType=user&targetId=1')
      .set('Cookie', cookieFor(3).cookie);
    expect(response.body.auditLogs[0]).toMatchObject({
      actorId: 3,
      action: 'user.suspended',
      requestId: 'request-1',
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'NEVER_RETURN_THIS_HASH'
    );
    expect(
      (
        await request(app)
          .get('/api/admin/audit-logs')
          .set('Cookie', cookieFor(1).cookie)
      ).status
    ).toBe(403);
    expect(
      (
        await signed(
          request(app).delete('/api/admin/audit-logs/1'),
          cookieFor(3)
        ).send({})
      ).status
    ).toBe(404);
    expect(
      (
        await signed(
          request(app).patch('/api/admin/audit-logs/1'),
          cookieFor(3)
        ).send({ reason: 'rewrite' })
      ).status
    ).toBe(404);
  });

  it('gates bootstrap/recovery behind trusted operator confirmation and stores only reset token hashes', () => {
    const deniedBootstrap = spawnSync(
      process.execPath,
      ['scripts/bootstrap-admin.js'],
      {
        env: {
          ...process.env,
          DATABASE_URL: '',
          ADMIN_BOOTSTRAP_EMAIL: '',
          ADMIN_BOOTSTRAP_CONFIRM: '',
        },
        encoding: 'utf8',
      }
    );
    expect(deniedBootstrap.status).not.toBe(0);
    expect(deniedBootstrap.stderr).toContain('ADMIN_BOOTSTRAP_CONFIRM');
    const bootstrap = readFileSync('scripts/bootstrap-admin.js', 'utf8');
    const recovery = readFileSync('scripts/admin-recovery-token.js', 'utf8');
    const migration = readFileSync('drizzle/0011_phase7_schema.sql', 'utf8');
    expect(bootstrap).toContain('email_verified = true');
    expect(bootstrap).toContain('ON CONFLICT (id) DO NOTHING');
    expect(bootstrap).toContain('createHash(\'sha256\')');
    expect(recovery).toContain('role = \'admin\' AND is_active = true');
    expect(recovery).toContain('UPDATE public.auth_sessions');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON admin_audit_logs');
    expect(migration).toContain('users_protect_last_active_admin');
  });
});
