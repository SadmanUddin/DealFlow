import { z } from 'zod';
import { paginationSchema } from '#validations/listing.validation.js';

const id = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().safe());
export const phase6IdSchema = z.object({ id });
export const favoriteListingIdSchema = z.object({ listingId: id });
export const notificationQuerySchema = paginationSchema
  .extend({ unread: z.enum(['true', 'false']).optional() })
  .strict();
export const inquiryStatusSchema = z
  .object({
    status: z.enum(['pending', 'in_review', 'accepted', 'rejected', 'closed']),
  })
  .strict();
export const emailPreferenceSchema = z
  .object({
    listingStatus: z.boolean().optional(),
    listingPrice: z.boolean().optional(),
    listingDetails: z.boolean().optional(),
    dealUpdates: z.boolean().optional(),
  })
  .strict()
  .refine(
    value => Object.keys(value).length > 0,
    'At least one preference is required'
  );
