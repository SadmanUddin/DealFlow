import 'dotenv/config';
import { z } from 'zod';

const postgresUrl = z
  .url()
  .refine(
    value => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
    'Database URLs must use a PostgreSQL protocol'
  );

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: postgresUrl.optional(),
    TEST_DATABASE_URL: postgresUrl.optional(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    ARCJET_KEY: z.string().min(1, 'ARCJET_KEY is required'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .refine(
        value =>
          value.split(',').every(origin => {
            try {
              const parsedOrigin = new URL(origin.trim());
              return (
                ['http:', 'https:'].includes(parsedOrigin.protocol) &&
                parsedOrigin.origin === origin.trim()
              );
            } catch {
              return false;
            }
          }),
        'CORS_ORIGINS must be a comma-separated list of origins'
      ),
    DOCUMENT_STORAGE_DRIVER: z.enum(['r2', 'mock']).default('mock'),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_ENDPOINT: z.url().optional(),
    R2_REGION: z.string().default('auto'),
    DOCUMENT_MAX_SIZE_BYTES: z.coerce.number().int().positive().max(10485760).default(10485760),
    EMAIL_PROVIDER: z.enum(['resend', 'mock']).default('resend'),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().default('notifications@example.com'),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(60000).default(2000),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((environment, context) => {
    if (environment.DOCUMENT_STORAGE_DRIVER === 'r2') {
      for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) {
        if (!environment[key]) context.addIssue({ code: 'custom', path: [key], message: `${key} is required when R2 storage is enabled` });
      }
    }
    const key =
      environment.NODE_ENV === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
    if (!environment[key]) {
      context.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is required for ${environment.NODE_ENV} mode`,
      });
    }
  });

export const getEnvironment = () => environmentSchema.parse(process.env);
