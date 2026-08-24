import { z } from 'zod'

export const loadCreditSchema = z.object({
  meterId: z.string().uuid(),
  usdcAmount: z.number().positive(),
  solanaSignature: z.string().optional(),
})

export type LoadCreditDto = z.infer<typeof loadCreditSchema>
