import { z } from 'zod'

export const adminQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0).optional(),
  take: z.coerce.number().int().min(1).max(50).default(20).optional(),
  verified: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  status: z.enum(['ONLINE', 'OFFLINE', 'UNKNOWN']).optional(),
})

export type AdminQueryDto = z.infer<typeof adminQuerySchema>
