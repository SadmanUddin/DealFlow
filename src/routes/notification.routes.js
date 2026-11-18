import express from 'express';
import { deleteNotification, getEmailPreferences, listNotifications, markAllNotificationsRead, markNotificationRead, updateEmailPreferences } from '#controllers/notification.controller.js';
import { requireAuthentication, requireCsrf } from '#middleware/auth.middleware.js';

const router = express.Router();
router.use(requireAuthentication);
router.get('/', listNotifications);
router.patch('/read', requireCsrf, markAllNotificationsRead);
router.patch('/:id/read', requireCsrf, markNotificationRead);
router.delete('/:id', requireCsrf, deleteNotification);
router.get('/preferences/email', getEmailPreferences);
router.patch('/preferences/email', requireCsrf, updateEmailPreferences);
export default router;
