import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .max(255);
const passwordBytes = (value: string) => new TextEncoder().encode(value).length;
const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .refine(
    (value) => passwordBytes(value) <= 72,
    "Password must be no more than 72 UTF-8 bytes",
  );

export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Enter your password")
    .refine(
      (value) => passwordBytes(value) <= 72,
      "Password must be no more than 72 UTF-8 bytes",
    ),
});

export const signUpSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
    role: z.enum(["buyer", "seller"]),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(32, "Enter the reset token from your link").max(512),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const verifyEmailSchema = z.object({
  token: z
    .string()
    .min(32, "Enter the verification token from your link")
    .max(512),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
});

export type SignInValues = z.input<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailValues = z.infer<typeof verifyEmailSchema>;
export type ProfileValues = z.infer<typeof profileSchema>;
