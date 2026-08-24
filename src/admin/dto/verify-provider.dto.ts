import { z } from 'zod'

export const verifyProviderSchema = z.object({
  isVerified: z.boolean(),
})

export type VerifyProviderDto = z.infer<typeof verifyProviderSchema>
