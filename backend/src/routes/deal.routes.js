import express from 'express';
import {
  actOnDocumentRequest,
  addChecklistItem,
  addDocumentRequest,
  diligence,
  editChecklistItem,
} from '#controllers/diligence.controller.js';
import {
  changeStatus,
  closing,
  create,
  documents,
  detail,
  downloadDocument,
  history,
  linkDocument,
  list,
  offer,
  offers,
  respond,
  withdraw,
} from '#controllers/deal.controller.js';
import {
  getDealConversation,
  startDealConversation,
} from '#controllers/conversation.controller.js';
import {
  authorizeRoles,
  requireAuthentication,
  requireCsrf,
} from '#middleware/auth.middleware.js';

const router = express.Router();
router.use(requireAuthentication);
router.get('/', list);
router.post('/', authorizeRoles('buyer'), requireCsrf, create);
router.get('/:id', detail);
router.get('/:id/conversation', getDealConversation);
router.post(
  '/:id/conversation',
  authorizeRoles('buyer'),
  requireCsrf,
  startDealConversation
);
router.patch('/:id/status', requireCsrf, changeStatus);
router.post('/:id/closing', requireCsrf, closing);
router.get('/:id/offers', offers);
router.post('/:id/offers', requireCsrf, offer);
router.post('/:id/offers/:offerId/respond', requireCsrf, respond);
router.post('/:id/offers/:offerId/withdraw', requireCsrf, withdraw);
router.get('/:id/history', history);
router.get('/:id/documents', documents);
router.get('/:id/documents/:documentId/download', downloadDocument);
router.post('/:id/documents', requireCsrf, linkDocument);
router.get('/:id/diligence', diligence);
router.post('/:id/diligence/checklist', requireCsrf, addChecklistItem);
router.patch(
  '/:id/diligence/checklist/:recordId',
  requireCsrf,
  editChecklistItem
);
router.post('/:id/diligence/requests', requireCsrf, addDocumentRequest);
router.patch(
  '/:id/diligence/requests/:recordId',
  requireCsrf,
  actOnDocumentRequest
);
export default router;
