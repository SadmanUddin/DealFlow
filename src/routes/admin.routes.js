import express from 'express';
import { requireAdmin, requireCsrf } from '#middleware/auth.middleware.js';
import { adminReports, adminUser, adminUsers, auditLogs, createAdmin, dashboard, listingHistory, listingStatus, updateReport, userRole, userSessions, userStatus } from '#controllers/admin.controller.js';

const router = express.Router();
router.use(...requireAdmin);
router.get('/dashboard', dashboard);
router.get('/users', adminUsers);
router.get('/users/:id', adminUser);
router.patch('/users/:id/status', requireCsrf, userStatus);
router.patch('/users/:id/role', requireCsrf, userRole);
router.post('/users/:id/revoke-sessions', requireCsrf, userSessions);
router.post('/admins', requireCsrf, createAdmin);
router.get('/audit-logs', auditLogs);
router.patch('/listings/:id/status', requireCsrf, listingStatus);
router.get('/listings/:id/history', listingHistory);
router.get('/reports', adminReports);
router.patch('/reports/:id', requireCsrf, updateReport);
export default router;
