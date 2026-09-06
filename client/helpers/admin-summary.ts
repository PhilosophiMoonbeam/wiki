import type { InjectionKey, Ref } from 'vue'

export const adminSummaryKey: InjectionKey<{
  loading: Ref<boolean>
  error: Ref<string>
  refresh: () => Promise<void>
}> = Symbol('admin-summary')
