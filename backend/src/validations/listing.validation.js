import { z } from 'zod';

const money = z
  .string()
  .regex(
    /^\d{1,16}(\.\d{1,2})?$/,
    'Must be a non-negative amount with at most two decimal places'
  )
  .optional()
  .nullable();
const supportedCurrencies = new Set(Intl.supportedValuesOf('currency'));
const validCurrency = z
  .string()
  .refine(
    value => supportedCurrencies.has(value),
    'Must be a supported ISO currency code'
  );
const currency = validCurrency.default('USD');

const fields = {
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(20).max(10000),
  industry: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(160).optional().nullable(),
  website: z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine(
      value => ['http:', 'https:'].includes(new URL(value).protocol),
      'Website must use HTTPS or HTTP'
    )
    .optional()
    .nullable(),
  asking_price: money,
  annual_revenue: money,
  ebitda: money,
  currency,
};

export const emptyBodySchema = z.object({}).strict();
export const createListingSchema = z.object(fields).strict();
export const updateListingSchema = z
  .object({
    ...fields,
    currency: validCurrency.optional(),
  })
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, {
    message: 'At least one listing field must be provided',
  });

export const listingIdSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().safe()),
});

export const paginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const searchAmount = z
  .string()
  .regex(/^\d{1,16}(\.\d{1,2})?$/, 'Must be a non-negative amount')
  .optional();

export const publicListingQuerySchema = paginationSchema
  .extend({
    availability: z.enum(['available', 'sold', 'all']).optional(),
    q: z.string().trim().min(1).max(200).optional(),
    industry: z.string().trim().min(1).max(120).optional(),
    location: z.string().trim().min(1).max(160).optional(),
    minPrice: searchAmount,
    maxPrice: searchAmount,
    minRevenue: searchAmount,
    maxRevenue: searchAmount,
    minEbitda: searchAmount,
    maxEbitda: searchAmount,
    sort: z
      .enum(['newest', 'oldest', 'price_asc', 'price_desc'])
      .default('newest'),
  })
  .strict()
  .superRefine((query, context) => {
    for (const [minKey, maxKey] of [
      ['minPrice', 'maxPrice'],
      ['minRevenue', 'maxRevenue'],
      ['minEbitda', 'maxEbitda'],
    ]) {
      if (
        query[minKey] &&
        query[maxKey] &&
        Number(query[minKey]) > Number(query[maxKey])
      ) {
        context.addIssue({
          code: 'custom',
          path: [maxKey],
          message: `${maxKey} must be greater than or equal to ${minKey}`,
        });
      }
    }
  });

export const adminListingQuerySchema = paginationSchema
  .extend({
    status: z
      .enum(['draft', 'pending', 'published', 'rejected', 'archived', 'sold'])
      .optional(),
  })
  .strict();

export const moderationSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    rejectionReason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine(
    value => value.action !== 'reject' || Boolean(value.rejectionReason),
    { path: ['rejectionReason'], message: 'Rejection reason is required' }
  )
  .refine(
    value => value.action !== 'approve' || value.rejectionReason === undefined,
    {
      path: ['rejectionReason'],
      message: 'Approval cannot include a rejection reason',
    }
  );
