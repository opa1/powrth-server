import { z } from 'zod'

export const relayCommandSchema = z.object({
  action: z.enum(['TRIP', 'CLOSE']),
})

export type RelayCommandDto = z.infer<typeof relayCommandSchema>
