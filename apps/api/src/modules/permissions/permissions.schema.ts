import { z } from 'zod'

export const setUserPermissionsSchema = z.object({
  keys: z.array(z.string()),
})

export type SetUserPermissionsInput = z.infer<typeof setUserPermissionsSchema>
