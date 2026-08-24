import { z } from 'zod'

export const appleAuthSchema = z.object({
  identityToken: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
})

export type AppleAuthDto = z.infer<typeof appleAuthSchema>
