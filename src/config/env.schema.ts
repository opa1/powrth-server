import { z } from 'zod'

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  MASTER_MNEMONIC: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  APPLE_TEAM_ID: z.string().min(1),
  APPLE_KEY_ID: z.string().min(1),
  X_CLIENT_ID: z.string().min(1),
  X_CLIENT_SECRET: z.string().min(1),
  HELIUS_API_KEY: z.string().min(1),
  HELIUS_WEBHOOK_SECRET: z.string().min(1),
  SOLANA_RPC_URL: z.string().min(1),
  PLATFORM_FEE_RATE: z.coerce.number().default(0.02),
})

export type EnvConfig = z.infer<typeof envSchema>

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config)

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')

    throw new Error(`Environment validation failed:\n${issues}`)
  }

  return result.data
}

export function loadEnv(): EnvConfig {
  return validateEnv(process.env)
}
