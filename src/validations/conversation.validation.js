import { z } from 'zod';

const positiveId = z.number().int().positive().safe();
const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const conversationIdSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().safe()),
});

export const startConversationSchema = z
  .object({ listingId: positiveId })
  .strict();

export const conversationListQuerySchema = z.object(paginationFields).strict();

export const sendMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(10000),
  })
  .strict();

export const messageHistoryQuerySchema = z
  .object({
    limit: paginationFields.limit,
    cursor: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();

export const emptyConversationBodySchema = z.object({}).strict();

export const messageCursorSchema = z
  .object({
    createdAt: z.iso.datetime({ offset: true }),
    id: positiveId,
  })
  .strict();
