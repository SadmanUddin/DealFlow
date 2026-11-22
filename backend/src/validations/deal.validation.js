import { z } from 'zod';
import { isSupportedIso4217Currency } from '#utils/iso4217.js';

const id = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().safe());
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
export const dealIdSchema = z.object({ id }).strict();
export const dealOfferIdSchema = z.object({ id, offerId: id }).strict();
export const dealDocumentIdSchema = z.object({ documentId: id }).strict();
export const dealDocumentDownloadParamsSchema = z
  .object({ id, documentId: id })
  .strict();
export const createDealSchema = z
  .object({ listingId: z.number().int().positive().safe() })
  .strict();
export const dealListSchema = z.object(pagination).strict();
export const dealWorkspaceListSchema = dealListSchema.extend({
  view: z.enum(['open', 'completed', 'ended']).optional(),
});
export const createOfferSchema = z
  .object({
    amount: z
      .union([z.string(), z.number()])
      .transform(String)
      .pipe(
        z
          .string()
          .regex(/^\d{1,16}(\.\d{1,2})?$/)
          .refine(value => Number(value) > 0)
      ),
    currency: z
      .string()
      .refine(
        isSupportedIso4217Currency,
        'Currency must be a supported ISO 4217 code'
      ),
    message: z.string().trim().max(5000).optional(),
    parentOfferId: z.number().int().positive().safe().optional(),
  })
  .strict();
export const respondOfferSchema = z
  .object({ action: z.enum(['accept', 'reject']) })
  .strict();
export const dealStatusSchema = z
  .object({
    status: z.enum(['negotiating', 'due_diligence', 'cancelled', 'rejected']),
  })
  .strict();
export const linkDealDocumentSchema = z
  .object({ conversationDocumentId: z.number().int().positive().safe() })
  .strict();

const closingRevision = z.number().int().min(0).max(2147483647);
export const closingActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('propose'),
      revision: closingRevision,
      amount: createOfferSchema.shape.amount,
    })
    .strict(),
  z
    .object({
      action: z.literal('confirm'),
      revision: closingRevision,
      publicPriceConsent: z.boolean(),
    })
    .strict(),
  ...['agree', 'dispute', 'resolve'].map(action =>
    z.object({ action: z.literal(action), revision: closingRevision }).strict()
  ),
]);
