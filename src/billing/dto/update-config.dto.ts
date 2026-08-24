import { z } from 'zod'

export const updateConfigSchema = z.object({
  feeRatePercent: z.number().min(0).max(1).optional(),
  minCreditLoadUsdc: z.number().positive().optional(),
  minWithdrawalUsdc: z.number().positive().optional(),
  feeWalletAddress: z.string().optional(),
})

export type UpdateConfigDto = z.infer<typeof updateConfigSchema>
