import express from 'express';
import {
  getConversationMessages,
  getConversations,
  markConversationRead,
  sendConversationMessage,
  startConversation,
  updateInquiryStatus,
} from '#controllers/conversation.controller.js';
import {
  authorizeRoles,
  requireAuthentication,
  requireCsrf,
} from '#middleware/auth.middleware.js';

const router = express.Router();
router.use(requireAuthentication);
router.post('/', authorizeRoles('buyer'), requireCsrf, startConversation);
router.get('/', getConversations);
router.get('/:id/messages', getConversationMessages);
router.post('/:id/messages', requireCsrf, sendConversationMessage);
router.patch('/:id/read', requireCsrf, markConversationRead);
router.patch(
  '/:id/status',
  authorizeRoles('seller'),
  requireCsrf,
  updateInquiryStatus
);

export default router;
