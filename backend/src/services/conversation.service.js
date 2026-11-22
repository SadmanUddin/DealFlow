import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '#config/database.js';
import { businessListings } from '#models/listing.model.js';
import { users } from '#models/user.model.js';
import { conversations, messages } from '#models/conversation.model.js';
import { deals } from '#models/deal.model.js';
import { notifications } from '#models/phase6.model.js';
import { AppError } from '#utils/app-error.js';
import { messageCursorSchema } from '#validations/conversation.validation.js';

const conversationFields = {
  id: conversations.id,
  listingId: conversations.listing_id,
  status: conversations.status,
  statusUpdatedAt: conversations.status_updated_at,
  createdAt: conversations.created_at,
};
const messageFields = {
  id: messages.id,
  conversationId: messages.conversation_id,
  senderId: messages.sender_id,
  content: messages.content,
  createdAt: messages.created_at,
  readAt: messages.read_at,
};
const notFound = () =>
  new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation was not found');
const participantCondition = userId =>
  or(eq(conversations.buyer_id, userId), eq(conversations.seller_id, userId));
const pagination = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

export const startConversation = async (buyerId, listingId) => {
  const [existing] = await db
    .select(conversationFields)
    .from(conversations)
    .where(
      and(
        eq(conversations.listing_id, listingId),
        eq(conversations.buyer_id, buyerId)
      )
    )
    .limit(1);
  if (existing) return { conversation: existing, created: false };

  const source = db
    .select({
      id: sql`nextval(pg_get_serial_sequence('public.conversations', 'id'))::integer`,
      listing_id: businessListings.id,
      buyer_id: sql`${buyerId}::integer`,
      seller_id: businessListings.seller_id,
      status: sql`'pending'::varchar`,
      status_updated_at: sql`now()`,
      created_at: sql`now()`,
    })
    .from(businessListings)
    .where(
      and(
        eq(businessListings.id, listingId),
        eq(businessListings.status, 'published'),
        ne(businessListings.seller_id, buyerId)
      )
    );
  try {
    const [created] = await db
      .insert(conversations)
      .select(source)
      .onConflictDoNothing({
        target: [conversations.listing_id, conversations.buyer_id],
      })
      .returning(conversationFields);
    if (created) return { conversation: created, created: true };
  } catch (error) {
    if (
      (error?.cause?.constraint ?? error?.constraint) ===
      'listing_available_for_inquiry'
    ) {
      throw new AppError(
        409,
        'LISTING_UNAVAILABLE',
        'This business is no longer available'
      );
    }
    throw error;
  }

  // A concurrent request can win the unique constraint after the initial read.
  const [raced] = await db
    .select(conversationFields)
    .from(conversations)
    .where(
      and(
        eq(conversations.listing_id, listingId),
        eq(conversations.buyer_id, buyerId)
      )
    )
    .limit(1);
  if (raced) return { conversation: raced, created: false };
  throw new AppError(
    404,
    'LISTING_NOT_FOUND',
    'Published listing was not found'
  );
};

const conversationForDeal = async (deal, viewerId) => {
  const [row] = await db
    .select({
      ...conversationFields,
      listingTitle: businessListings.title,
      buyerId: conversations.buyer_id,
      sellerId: conversations.seller_id,
      participantName: sql`CASE WHEN ${viewerId} = ${deal.buyer_id} THEN (SELECT name FROM users WHERE id = ${deal.seller_id}) ELSE (SELECT name FROM users WHERE id = ${deal.buyer_id}) END`,
    })
    .from(conversations)
    .innerJoin(
      businessListings,
      eq(conversations.listing_id, businessListings.id)
    )
    .where(
      and(
        eq(conversations.listing_id, deal.listing_id),
        eq(conversations.buyer_id, deal.buyer_id),
        eq(conversations.seller_id, deal.seller_id)
      )
    )
    .limit(1);
  return row ?? null;
};

export const getDealConversation = async (dealId, userId) => {
  const [deal] = await db
    .select()
    .from(deals)
    .where(
      and(
        eq(deals.id, dealId),
        or(eq(deals.buyer_id, userId), eq(deals.seller_id, userId))
      )
    )
    .limit(1);
  if (!deal) throw notFound();
  return conversationForDeal(deal, userId);
};

export const startDealConversation = async (dealId, buyerId) => {
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.buyer_id, buyerId)))
    .limit(1);
  if (!deal) throw notFound();
  const result = await startConversation(buyerId, deal.listing_id);
  return {
    conversation: await conversationForDeal(deal, buyerId),
    created: result.created,
  };
};

const inquiryTransitions = {
  pending: ['in_review', 'accepted', 'rejected', 'closed'],
  in_review: ['accepted', 'rejected', 'closed'],
  accepted: ['closed'],
  rejected: ['closed'],
  closed: [],
};

export const updateInquiryStatus = async (conversationId, sellerId, status) => {
  const [current] = await db
    .select({ id: conversations.id, status: conversations.status })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.seller_id, sellerId)
      )
    )
    .limit(1);
  if (!current) throw notFound();
  if (!inquiryTransitions[current.status]?.includes(status)) {
    throw new AppError(
      409,
      'INVALID_INQUIRY_TRANSITION',
      `Cannot change inquiry from ${current.status} to ${status}`
    );
  }
  const [updated] = await db
    .update(conversations)
    .set({ status, status_updated_at: new Date() })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.seller_id, sellerId),
        eq(conversations.status, current.status)
      )
    )
    .returning({
      id: conversations.id,
      listingId: conversations.listing_id,
      status: conversations.status,
      statusUpdatedAt: conversations.status_updated_at,
    });
  if (!updated)
    throw new AppError(
      409,
      'INQUIRY_STATUS_CHANGED',
      'Inquiry status changed; reload and try again'
    );
  return updated;
};

export const getConversations = async (userId, { page, limit }) => {
  const where = participantCondition(userId);
  const offset = (page - 1) * limit;
  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: conversations.id,
        listingId: conversations.listing_id,
        listingTitle: businessListings.title,
        buyerId: conversations.buyer_id,
        sellerId: conversations.seller_id,
        participantName: sql`CASE WHEN ${conversations.buyer_id} = ${userId} THEN (SELECT name FROM users WHERE id = ${conversations.seller_id}) ELSE (SELECT name FROM users WHERE id = ${conversations.buyer_id}) END`,
        latestMessage: sql`(SELECT message.content FROM messages AS message WHERE message.conversation_id = ${conversations.id} ORDER BY message.created_at DESC, message.id DESC LIMIT 1)`,
        latestMessageAt: sql`(SELECT message.created_at FROM messages AS message WHERE message.conversation_id = ${conversations.id} ORDER BY message.created_at DESC, message.id DESC LIMIT 1)`,
        unreadCount: sql`(SELECT count(*)::int FROM messages AS message WHERE message.conversation_id = ${conversations.id} AND message.sender_id <> ${userId} AND message.read_at IS NULL)`,
        status: conversations.status,
        statusUpdatedAt: conversations.status_updated_at,
        createdAt: conversations.created_at,
      })
      .from(conversations)
      .innerJoin(
        businessListings,
        eq(conversations.listing_id, businessListings.id)
      )
      .where(where)
      .orderBy(
        sql`COALESCE((SELECT message.created_at FROM messages AS message WHERE message.conversation_id = ${conversations.id} ORDER BY message.created_at DESC, message.id DESC LIMIT 1), ${conversations.created_at}) DESC`,
        desc(conversations.id)
      )
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql`count(*)::int` })
      .from(conversations)
      .where(where),
  ]);
  const total = countRows[0]?.count ?? 0;
  return { conversations: rows, pagination: pagination(page, limit, total) };
};

export const getParticipantConversation = async (conversationId, userId) => {
  const [conversation] = await db
    .select(conversationFields)
    .from(conversations)
    .where(
      and(eq(conversations.id, conversationId), participantCondition(userId))
    )
    .limit(1);
  if (!conversation) throw notFound();
  return conversation;
};

const decodeCursor = cursor => {
  if (!cursor) return undefined;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = messageCursorSchema.parse(JSON.parse(decoded));
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Message cursor is invalid');
  }
};

const encodeCursor = message =>
  Buffer.from(
    JSON.stringify({
      createdAt: message.createdAt.toISOString(),
      id: message.id,
    })
  ).toString('base64url');

export const getConversationMessages = async (
  conversationId,
  userId,
  { limit, cursor }
) => {
  await getParticipantConversation(conversationId, userId);
  const decodedCursor = decodeCursor(cursor);
  const participantExists = exists(
    db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, messages.conversation_id),
          participantCondition(userId)
        )
      )
  );
  const filters = [
    eq(messages.conversation_id, conversationId),
    participantExists,
  ];
  if (decodedCursor) {
    filters.push(
      or(
        gt(messages.created_at, decodedCursor.createdAt),
        and(
          eq(messages.created_at, decodedCursor.createdAt),
          gt(messages.id, decodedCursor.id)
        )
      )
    );
  }
  const rows = await db
    .select({ ...messageFields, senderName: users.name })
    .from(messages)
    .innerJoin(users, eq(messages.sender_id, users.id))
    .where(and(...filters))
    .orderBy(asc(messages.created_at), asc(messages.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return {
    messages: pageRows,
    pagination: {
      limit,
      hasMore,
      nextCursor: hasMore ? encodeCursor(pageRows.at(-1)) : null,
    },
  };
};

export const sendConversationMessage = async (
  conversationId,
  senderId,
  content,
  requestKey
) => {
  const authorizedSource = db
    .select({
      id: sql`nextval(pg_get_serial_sequence('public.messages', 'id'))`,
      conversation_id: sql`${conversationId}`,
      sender_id: sql`${senderId}`,
      content: sql`${content}`,
      created_at: sql`now()`,
      read_at: sql`null`,
    })
    .from(conversations)
    .where(
      and(eq(conversations.id, conversationId), participantCondition(senderId))
    );
  const [message] = await db
    .insert(messages)
    .select(authorizedSource)
    .returning(messageFields);
  if (!message) throw notFound();
  const [sender] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, senderId))
    .limit(1);
  const recipientIdQuery = await db
    .select({
      buyerId: conversations.buyer_id,
      sellerId: conversations.seller_id,
      listingId: conversations.listing_id,
      listingTitle: businessListings.title,
    })
    .from(conversations)
    .innerJoin(
      businessListings,
      eq(businessListings.id, conversations.listing_id)
    )
    .where(
      and(eq(conversations.id, conversationId), participantCondition(senderId))
    )
    .limit(1);
  const conversation = recipientIdQuery[0];
  if (!conversation) throw notFound();
  const recipientId =
    senderId === conversation.buyerId
      ? conversation.sellerId
      : conversation.buyerId;
  const [deal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(
      and(
        eq(deals.listing_id, conversation.listingId),
        eq(deals.buyer_id, conversation.buyerId),
        eq(deals.seller_id, conversation.sellerId)
      )
    )
    .limit(1);
  await db
    .insert(notifications)
    .values({
      user_id: recipientId,
      dedupe_key: requestKey
        ? `message:${conversationId}:${senderId}:${requestKey}`
        : `message:${message.id}:received`,
      type: 'conversation.message',
      payload: {
        conversationId,
        messageId: message.id,
        senderName: sender?.name ?? 'A participant',
        listingId: conversation.listingId,
        listingTitle: conversation.listingTitle,
        ...(deal ? { dealId: deal.id } : {}),
      },
    })
    .onConflictDoNothing({ target: notifications.dedupe_key });
  return { ...message, senderName: sender?.name ?? null };
};

export const markConversationRead = async (conversationId, userId) => {
  await getParticipantConversation(conversationId, userId);
  const participantExists = exists(
    db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, messages.conversation_id),
          participantCondition(userId)
        )
      )
  );
  const updated = await db
    .update(messages)
    .set({ read_at: new Date() })
    .where(
      and(
        eq(messages.conversation_id, conversationId),
        ne(messages.sender_id, userId),
        isNull(messages.read_at),
        participantExists
      )
    )
    .returning({ id: messages.id });
  return { conversationId, readCount: updated.length };
};
