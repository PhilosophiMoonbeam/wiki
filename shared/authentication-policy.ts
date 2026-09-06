export type AuthenticationValue = string | number | boolean | null
export interface AuthenticationField {
  key: string
  title: string
  type: 'string' | 'number' | 'boolean'
  hint: string
  default: AuthenticationValue
  sensitive: boolean
  multiline: boolean
  choices: AuthenticationValue[]
  order: number
}
export interface AuthenticationDefinition {
  key: string
  title: string
  description: string
  available: boolean
  useForm: boolean
  website: string
  fields: AuthenticationField[]
}
export type AuthenticationSecret = { action: 'keep' | 'clear' } | { action: 'replace'; value: string }
export interface AuthenticationProviderDraft {
  key: string
  strategyKey: string
  displayName: string
  description: string
  isEnabled: boolean
  selfRegistration: boolean
  domainWhitelist: string[]
  autoEnrollGroups: number[]
  config: Record<string, AuthenticationValue>
  secrets: Record<string, AuthenticationSecret>
}
export interface AuthenticationRuntime {
  state: 'ready' | 'failed' | 'disabled' | 'unavailable' | 'pending'
  checkedAt: string | null
  revision: string
}
export interface AuthenticationProvider extends AuthenticationProviderDraft {
  accountCount: number
  activeAccountCount: number
  configuredSecrets: string[]
  runtime: AuthenticationRuntime
}
export interface AuthenticationEvent {
  id: number
  actorId: number | null
  reason: string
  changes: Array<{ key: string; name: string; action: 'created' | 'updated' | 'deleted'; fields: string[]; sessionsEnded: number }>
  createdAt: string
}
export interface AuthenticationWorkspace {
  fingerprint: string
  host: string
  providers: AuthenticationProvider[]
  definitions: AuthenticationDefinition[]
  groups: Array<{ id: number; name: string; administrative: boolean; system: boolean }>
  history: AuthenticationEvent[]
}
export interface AuthenticationWriteResult {
  sessionsEnded: number
  currentSessionEnded: boolean
  activation: 'applied' | 'needs-attention'
}
