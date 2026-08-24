import { z } from 'zod'

export const billingQuerySchema = z.object({
  meterId: z.string().uuid().optional(),
  skip: z.coerce.number().int().min(0).default(0).optional(),
  take: z.coerce.number().int().min(1).max(50).default(20).optional(),
})

export type BillingQueryDto = z.infer<typeof billingQuerySchema>
