import { z } from 'zod'

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional(),
})

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>
