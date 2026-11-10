import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CLIENT_URL: z.url(),

  POSTGRESQL_URL: z.string().min(1),

  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_REGION: z.string().min(1),
  AWS_IMAGE_BUCKET_NAME: z.string().min(1),

  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_JWT_KEY: z.string().min(1),
  CLERK_AUTHORIZED_PARTIES: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((party) => party.trim())),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.url(),
  GMAIL_MAX_MESSAGES: z.coerce.number().int().positive().max(500).default(100),

  OAUTH_STATE_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, {
      message: 'TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64',
    }),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1).default('gpt-5.5'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
