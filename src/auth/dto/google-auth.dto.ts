import { z } from 'zod'

export const googleAuthSchema = z.object({
  idToken: z.string().min(1),
})

export type GoogleAuthDto = z.infer<typeof googleAuthSchema>
