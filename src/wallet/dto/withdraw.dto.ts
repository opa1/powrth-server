import { z } from 'zod'

export const withdrawSchema = z.object({
  usdcAmount: z.number().positive(),
  toWalletAddress: z.string().min(32).max(44),
})

export type WithdrawDto = z.infer<typeof withdrawSchema>
