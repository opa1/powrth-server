import { z } from 'zod'

export const onboardingSchema = z.object({
  role: z.enum(['PROVIDER', 'CONSUMER']),
  name: z.string().min(1).max(100),
})

export type OnboardingDto = z.infer<typeof onboardingSchema>
