import { z } from 'zod'

export const assignMeterSchema = z.object({
  consumerId: z.string().uuid(),
})

export type AssignMeterDto = z.infer<typeof assignMeterSchema>
