import express from 'express';
import { changeStatus, create, documents, detail, downloadDocument, history, linkDocument, list, offer, offers, respond, withdraw } from '#controllers/deal.controller.js';
import { authorizeRoles, requireAuthentication, requireCsrf } from '#middleware/auth.middleware.js';

const router = express.Router();
router.use(requireAuthentication);
router.get('/', list);
router.post('/', authorizeRoles('buyer'), requireCsrf, create);
router.get('/:id', detail);
router.patch('/:id/status', requireCsrf, changeStatus);
router.get('/:id/offers', offers);
router.post('/:id/offers', requireCsrf, offer);
router.post('/:id/offers/:offerId/respond', requireCsrf, respond);
router.post('/:id/offers/:offerId/withdraw', requireCsrf, withdraw);
router.get('/:id/history', history);
router.get('/:id/documents', documents);
router.get('/:id/documents/:documentId/download', downloadDocument);
router.post('/:id/documents', requireCsrf, linkDocument);
export default router;
