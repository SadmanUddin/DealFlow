import {
  getConversationMessages as getConversationMessagesService,
  getConversations as getConversationsService,
  markConversationRead as markConversationReadService,
  sendConversationMessage as sendConversationMessageService,
  startConversation as startConversationService,
  getDealConversation as getDealConversationService,
  startDealConversation as startDealConversationService,
  updateInquiryStatus as updateInquiryStatusService,
} from '#services/conversation.service.js';
import { dealIdSchema } from '#validations/deal.validation.js';
import {
  conversationIdSchema,
  conversationListQuerySchema,
  emptyConversationBodySchema,
  messageHistoryQuerySchema,
  sendMessageSchema,
  startConversationSchema,
} from '#validations/conversation.validation.js';
import { inquiryStatusSchema } from '#validations/phase6.validation.js';

export const startConversation = async (req, res) => {
  const { listingId } = startConversationSchema.parse(req.body);
  const result = await startConversationService(req.user.id, listingId);
  res.status(result.created ? 201 : 200).json({
    conversation: result.conversation,
  });
};

export const getDealConversation = async (req, res) => {
  const { id } = dealIdSchema.parse(req.params);
  res
    .status(200)
    .json({ conversation: await getDealConversationService(id, req.user.id) });
};

export const startDealConversation = async (req, res) => {
  const { id } = dealIdSchema.parse(req.params);
  const result = await startDealConversationService(id, req.user.id);
  res
    .status(result.created ? 201 : 200)
    .json({ conversation: result.conversation });
};

export const updateInquiryStatus = async (req, res) => {
  const { id } = conversationIdSchema.parse(req.params);
  const { status } = inquiryStatusSchema.parse(req.body);
  res.status(200).json({
    inquiry: await updateInquiryStatusService(id, req.user.id, status),
  });
};

export const getConversations = async (req, res) => {
  const query = conversationListQuerySchema.parse(req.query);
  res.status(200).json(await getConversationsService(req.user.id, query));
};

export const getConversationMessages = async (req, res) => {
  const { id } = conversationIdSchema.parse(req.params);
  const query = messageHistoryQuerySchema.parse(req.query);
  res
    .status(200)
    .json(await getConversationMessagesService(id, req.user.id, query));
};

export const sendConversationMessage = async (req, res) => {
  const { id } = conversationIdSchema.parse(req.params);
  const { content } = sendMessageSchema.parse(req.body);
  const message = await sendConversationMessageService(
    id,
    req.user.id,
    content,
    req.get('Idempotency-Key')
  );
  res.status(201).json({ message });
};

export const markConversationRead = async (req, res) => {
  const { id } = conversationIdSchema.parse(req.params);
  emptyConversationBodySchema.parse(req.body ?? {});
  res.status(200).json(await markConversationReadService(id, req.user.id));
};
