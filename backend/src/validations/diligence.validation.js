import { z } from 'zod';
import { dealIdSchema } from '#validations/deal.validation.js';

const category = z.enum([
  'financial',
  'legal',
  'operational',
  'commercial',
  'technology',
  'other',
]);
const status = z.enum(['pending', 'in_progress', 'completed', 'blocked']);
const assignedTo = z.enum(['buyer', 'seller']);
const text = max =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      value => value.isWellFormed() && !value.includes('\0'),
      'Enter valid text without null characters'
    );
const fields = {
  title: text(160).refine(value => value.length > 0, 'Enter a title'),
  description: text(4000),
  dueDate: z.iso
    .date()
    .refine(
      value => !value.startsWith('0000'),
      'Enter a year from 0001 to 9999'
    )
    .nullable(),
};
const creationKey = z.uuid();
const revision = z.number().int().nonnegative().max(2147483646);
const databaseId = dealIdSchema.shape.id.pipe(z.number().max(2147483647));
export const diligenceDealParams = dealIdSchema.extend({ id: databaseId });
export const diligenceRecordParams = diligenceDealParams.extend({
  recordId: databaseId,
});
const creationFields = {
  ...fields,
  description: fields.description.default(''),
  dueDate: fields.dueDate.default(null),
  creationKey,
};
export const diligenceQuery = z
  .object({
    category: category.optional(),
    status: status.optional(),
    assignment: z.enum(['mine', 'other']).optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    requestPage: z.coerce.number().int().min(1).max(1000000).default(1),
  })
  .strict();
export const createChecklistSchema = z
  .object({
    ...creationFields,
    category,
    assignedTo,
  })
  .strict();
export const updateChecklistSchema = z
  .object({
    ...fields,
    category,
    assignedTo,
    status,
  })
  .partial()
  .extend({ revision })
  .strict()
  .refine(
    value => Object.keys(value).length > 1,
    'Provide at least one change'
  );
export const createDocumentRequestSchema = z.object(creationFields).strict();
export const updateDocumentRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('submit'),
      revision,
      documentId: z.number().int().positive().max(2147483647),
    })
    .strict(),
  z
    .object({
      action: z.enum(['review', 'accept', 'request_changes']),
      revision,
      feedback: text(4000).optional(),
    })
    .strict(),
]);
