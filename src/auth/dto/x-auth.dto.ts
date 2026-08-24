import { z } from 'zod'

export const xAuthSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(1),
  redirectUri: z.string().url(),
})

export type XAuthDto = z.infer<typeof xAuthSchema>
