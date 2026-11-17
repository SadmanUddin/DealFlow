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
import { conversations, messages } from '#models/conversation.model.js';
import { AppError } from '#utils/app-error.js';
import { messageCursorSchema } from '#validations/conversation.validation.js';

const conversationFields = {
  id: conversations.id,
  listingId: conversations.listing_id,
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
      id: sql`nextval(pg_get_serial_sequence('public.conversations', 'id'))`,
      listing_id: businessListings.id,
      buyer_id: sql`${buyerId}`,
      seller_id: businessListings.seller_id,
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
  const [created] = await db
    .insert(conversations)
    .select(source)
    .onConflictDoNothing({
      target: [conversations.listing_id, conversations.buyer_id],
    })
    .returning(conversationFields);
  if (created) return { conversation: created, created: true };

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

export const getConversations = async (userId, { page, limit }) => {
  const where = participantCondition(userId);
  const offset = (page - 1) * limit;
  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: conversations.id,
        listingId: conversations.listing_id,
        listingTitle: businessListings.title,
        createdAt: conversations.created_at,
      })
      .from(conversations)
      .innerJoin(
        businessListings,
        eq(conversations.listing_id, businessListings.id)
      )
      .where(where)
      .orderBy(desc(conversations.created_at), desc(conversations.id))
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
    .select(messageFields)
    .from(messages)
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
  content
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
  return message;
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
