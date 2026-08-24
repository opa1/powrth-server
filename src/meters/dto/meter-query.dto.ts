import { z } from 'zod'

export const meterQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0).optional(),
  take: z.coerce.number().int().min(1).max(50).default(20).optional(),
})

export type MeterQueryDto = z.infer<typeof meterQuerySchema>
