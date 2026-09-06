import { z } from 'zod'

export const ApiKeyGrantSchema = z.object({
  groupId: z.number().int().positive().nullable(),
  mcpResource: z.string().nullable(),
  mcpResourceVersion: z.number().int().nullable()
})
export type ApiKeyGrant = z.infer<typeof ApiKeyGrantSchema>
export const ApiConnectionInfoSchema = z.object({
  mcpEnabled: z.boolean(),
  mcpResource: z.string().nullable(),
  mcpConfigurationError: z.boolean(),
  groups: z.array(z.object({ id: z.number().int(), name: z.string(), permissions: z.array(z.string()), pageRuleCount: z.number().int().nonnegative(), pageRules: z.array(z.object({ match: z.string(), path: z.string(), deny: z.boolean(), roles: z.array(z.string()), locales: z.array(z.string()) })) }))
})
export type ApiConnectionInfo = z.infer<typeof ApiConnectionInfoSchema>
export const API_KEY_EXPIRATIONS = ['30d', '90d', '180d', '1y', '3y'] as const
export const apiKeyState = (key: { isRevoked: boolean; expiration: string }, now = Date.now()): 'active' | 'expired' | 'revoked' | 'unknown' => {
  if (key.isRevoked) return 'revoked'
  const expiry = Date.parse(key.expiration)
  if (!Number.isFinite(expiry)) return 'unknown'
  return expiry <= now ? 'expired' : 'active'
}
