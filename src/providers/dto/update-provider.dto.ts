import { z } from 'zod'

export const updateProviderSchema = z.object({
  businessName: z.string().min(1).max(200).optional(),
  pricePerKwh: z.number().positive().optional(),
})

export type UpdateProviderDto = z.infer<typeof updateProviderSchema>
