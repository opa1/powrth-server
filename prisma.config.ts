import { defineConfig, env } from 'prisma/config'

try {
  process.loadEnvFile()
} catch {
  // No .env file present; rely on environment variables injected by the host (e.g. PM2, CI).
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
