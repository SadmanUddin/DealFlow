import { z } from 'zod';

const email = z.email().max(255).toLowerCase().trim();
const passwordLength = value => Buffer.byteLength(value, 'utf8') <= 72;
export const password = z
  .string()
  .min(12)
  .refine(passwordLength, 'Password must not exceed 72 UTF-8 bytes');
const passwordInput = z
  .string()
  .min(1)
  .refine(passwordLength, 'Password must not exceed 72 UTF-8 bytes');

export const signupSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email,
    password,
    role: z.enum(['buyer', 'seller']).default('buyer'),
  })
  .strict();

export const signInSchema = z
  .object({
    email,
    password: passwordInput,
    mfaCode: z
      .string()
      .trim()
      .regex(/^(?:\d{6}|[a-fA-F0-9]{32})$/)
      .optional(),
  })
  .strict();

export const tokenSchema = z
  .object({
    token: z.string().min(32).max(512),
  })
  .strict();

export const forgotPasswordSchema = z.object({ email }).strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(32).max(512),
    password,
  })
  .strict();

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one profile field must be provided',
  });

export const deactivateAccountSchema = z
  .object({
    password: passwordInput,
  })
  .strict();

export const mfaEnrollmentSchema = z
  .object({ password: passwordInput })
  .strict();
export const mfaConfirmationSchema = mfaEnrollmentSchema.extend({
  code: z
    .string()
    .trim()
    .regex(/^(?:\d{6}|[a-fA-F0-9]{32})$/),
});
