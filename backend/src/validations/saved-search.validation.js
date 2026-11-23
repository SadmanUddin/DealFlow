import { z } from 'zod';
import {
  listingIdSchema,
  paginationSchema,
  savedMarketplaceFiltersSchema,
} from '#validations/listing.validation.js';
import { marketplaceFilterKeys } from '#utils/marketplace-criteria.js';

export const savedSearchId = listingIdSchema.extend({
  id: listingIdSchema.shape.id.pipe(z.number().max(2147483647)),
});
export const savedSearchPage = paginationSchema;
const common = {
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(
      value => value.isWellFormed() && !value.includes('\0'),
      'Enter a valid name'
    ),
  filters: savedMarketplaceFiltersSchema,
  alertsEnabled: z.boolean(),
  frequency: z.enum(['instant', 'daily', 'weekly', 'off']),
  confirmEmpty: z.boolean().optional(),
};
const validateEmpty = (value, ctx) => {
  if (
    value.filters &&
    !marketplaceFilterKeys.some(key => value.filters[key]) &&
    !value.confirmEmpty
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['filters'],
      message: 'Confirm saving a search without filters',
    });
  }
};

export const createSavedSearchSchema = z
  .object(common)
  .strict()
  .superRefine(validateEmpty);
export const updateSavedSearchSchema = z
  .object(common)
  .partial()
  .strict()
  .superRefine((value, ctx) => {
    validateEmpty(value, ctx);
    if (!Object.keys(value).some(key => key !== 'confirmEmpty')) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one change' });
    }
  });
