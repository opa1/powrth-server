import { z } from 'zod'

export const registerMeterSchema = z.object({
  meterAddr: z.string().regex(/^[0-9a-fA-F]{12}$/, 'Must be a 12-char hex string'),
  pricePerKwh: z.number().positive().optional(),
})

export type RegisterMeterDto = z.infer<typeof registerMeterSchema>
