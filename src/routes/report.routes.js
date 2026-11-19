import express from 'express';
import { requireAuthentication, requireCsrf } from '#middleware/auth.middleware.js';
import { ownReports, submitReport } from '#controllers/admin.controller.js';

const router = express.Router();
router.use(requireAuthentication);
router.get('/', ownReports);
router.post('/', requireCsrf, submitReport);
export default router;
