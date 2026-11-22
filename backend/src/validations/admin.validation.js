import { z } from 'zod';

const id = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().safe());
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
export const adminIdSchema = z.object({ id });
export const adminUserQuerySchema = z
  .object({
    ...pagination,
    q: z.string().trim().min(1).max(200).optional(),
    role: z.enum(['buyer', 'seller', 'admin']).optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .strict();
export const adminUserActionSchema = z
  .object({
    action: z.enum(['suspend', 'reactivate']),
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();
export const adminRoleSchema = z
  .object({
    role: z.enum(['buyer', 'seller', 'admin']),
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();
export const adminReasonSchema = z
  .object({ reason: z.string().trim().min(3).max(2000) })
  .strict();
export const adminProvisionSchema = z
  .object({
    email: z.email().max(255).toLowerCase().trim(),
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();
export const listingAvailabilitySchema = z
  .object({
    action: z.enum(['suspend', 'restore']),
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();
export const auditQuerySchema = z
  .object({
    ...pagination,
    actorId: z.coerce.number().int().positive().optional(),
    action: z.string().trim().min(1).max(80).optional(),
    targetType: z.enum(['user', 'listing', 'report', 'admin']).optional(),
    targetId: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
export const adminListingQuerySchema = z
  .object({
    ...pagination,
    status: z
      .enum([
        'draft',
        'pending',
        'published',
        'rejected',
        'archived',
        'suspended',
        'sold',
      ])
      .optional(),
    q: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export const reportCreateSchema = z
  .object({
    listingId: z.number().int().positive().safe().optional(),
    reportedUserId: z.number().int().positive().safe().optional(),
    category: z.enum([
      'suspicious_activity',
      'misleading_information',
      'potential_scam',
      'marketplace_violation',
      'other',
    ]),
    description: z.string().trim().min(10).max(5000),
  })
  .strict()
  .refine(
    value =>
      Number(Boolean(value.listingId)) +
        Number(Boolean(value.reportedUserId)) ===
      1,
    'Report exactly one listing or user'
  );
export const reportQuerySchema = z
  .object({
    ...pagination,
    status: z
      .enum(['pending', 'under_review', 'resolved', 'dismissed'])
      .optional(),
    category: z
      .enum([
        'suspicious_activity',
        'misleading_information',
        'potential_scam',
        'marketplace_violation',
        'other',
      ])
      .optional(),
    q: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export const reportActionSchema = z
  .object({
    status: z.enum(['under_review', 'resolved', 'dismissed']),
    reason: z.string().trim().min(3).max(2000),
    moderatorNotes: z.string().trim().max(5000).optional(),
  })
  .strict();
