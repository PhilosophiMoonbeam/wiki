import { defineComponent } from 'vue'
import { sameOriginJsonFetch } from './json-transport.ts'
export const fetchPasswordMinimum = async (): Promise<number> => {
  const response = await sameOriginJsonFetch(window.fetch.bind(window), '/_api/auth/password-policy', { credentials: 'same-origin' })
  const value: unknown = await response.json()
  const minimum = value && typeof value === 'object' ? Reflect.get(value, 'minimum') : null
  if (!response.ok || typeof minimum !== 'number' || !Number.isSafeInteger(minimum) || minimum < 12 || minimum > 64)
    throw new Error('Password requirements could not be loaded.')
  return minimum
}

export const passwordPolicyMixin = defineComponent({
  data() {
    return { passwordMinimum: 12, passwordRequirementsLoaded: false }
  },
  computed: {
    passwordHint(): string {
      return this.passwordRequirementsLoaded
        ? `At least ${this.passwordMinimum} characters; at most 72 UTF-8 bytes.`
        : 'Workspace password requirements are checked when saving.'
    }
  },
  created() {
    void fetchPasswordMinimum()
      .then(minimum => {
        this.passwordMinimum = minimum
        this.passwordRequirementsLoaded = true
      })
      .catch(() => {})
  }
})
