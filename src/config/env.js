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
  })
  .superRefine((environment, context) => {
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
