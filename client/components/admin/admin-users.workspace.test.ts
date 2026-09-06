import { newPasswordIssue } from '../../../shared/security-policy.ts'
import fs from 'node:fs'
import { accountActionTitle, accountProfileIssues } from '../../../shared/account-policy.ts'
import { describe, expect, it, vi } from '../../../server/test/bun-test.mts'
const source = fs.readFileSync('client/components/admin/admin-users-edit.vue', 'utf8'),
  script = source.match(/<script lang="ts">([\s\S]*?)<\/script>/)![1]!
const compiled = new Bun.Transpiler({ loader: 'ts' }).transformSync(script.replace(/^import .+$/gm, '').replace('export default', 'const component ='))
const snapshot = {
  id: 7,
  name: 'Alex',
  email: 'alex@example.invalid',
  profile: { name: 'Alex', email: 'alex@example.invalid', location: 'Before', jobTitle: '', timezone: 'UTC', groups: [3] },
  fingerprint: 'version-one',
  availableGroups: [{ id: 3, name: 'Authors', permissions: ['read:pages'], canAssign: true }],
  capabilities: { edit: true, actions: ['deactivate', 'end-sessions'] },
  history: []
}
function arrange(overrides: Record<string, unknown> = {}) {
  const transport = {
    fetchAccount: vi.fn().mockResolvedValue(structuredClone(snapshot)),
    fetchAccountDirectory: vi.fn(),
    saveAccountProfile: vi.fn(),
    actOnAccount: vi.fn(),
    replaceAccountPassword: vi.fn(),
    deleteAccount: vi.fn(),
    sendAccountWelcomeEmail: vi.fn(),
    ...overrides
  }
  const window = { confirm: vi.fn().mockReturnValue(true), location: { assign: vi.fn() } }
  const dependencies = {
    passwordPolicyMixin: {},
    newPasswordIssue,
    AsyncState: {},
    accountActionTitle,
    accountProfileIssues,
    wikiStore: { user: { id: 1 } },
    accountRequestStatus: (error: { status?: number }) => error.status ?? 0,
    getErrorMessage: (error: Error) => error.message,
    window,
    ...transport
  }
  const component = new Function(...Object.keys(dependencies), compiled + ';return component')(...Object.values(dependencies))
  const state = { ...component.data(), passwordMinimum: 12, $route: { params: { id: '7' }, query: {}, hash: '' }, $router: { replace: vi.fn(), push: vi.fn() } }
  for (const [key, method] of Object.entries(component.methods)) state[key] = (method as (...args: unknown[]) => unknown).bind(state)
  for (const [key, getter] of Object.entries(component.computed)) Object.defineProperty(state, key, { get: () => (getter as () => unknown).call(state) })
  return { state, component, transport, window }
}
describe('account workspace review and recovery', () => {
  it('isolates profile drafts, supports clearing fields, and locks security actions while dirty', async () => {
    const { state } = arrange()
    await state.reload()
    state.draft.location = ''
    state.draft.groups.push(4)
    expect(state.saved.profile.location).toBe('Before')
    expect(state.saved.profile.groups).toEqual([3])
    expect(state.dirty).toBe(true)
    expect(state.actionLocked).toBe(true)
    state.open('deactivate')
    expect(state.dialog).toBe(false)
    state.reset()
    expect(state.dirty).toBe(false)
  })
  it('keeps the draft, reason and saved baseline after a conflict and disables repeat confirmation', async () => {
    const { state, transport } = arrange()
    await state.reload()
    state.draft.location = ''
    state.open('profile')
    state.reason = 'Remove old location'
    transport.saveAccountProfile.mockRejectedValue(Object.assign(new Error('Account changed'), { status: 409 }))
    await state.confirm()
    expect(state.dialog).toBe(true)
    expect(state.draft.location).toBe('')
    expect(state.saved.profile.location).toBe('Before')
    expect(state.reason).toBe('Remove old location')
    expect(state.conflict).toBe(true)
    expect(state.busy).toBe(false)
  })
  it('sends a fixed draft snapshot and keeps navigation locked through a save', async () => {
    let resolve: (value: unknown) => void = () => {}
    const { state, transport } = arrange({
      saveAccountProfile: vi.fn(
        () =>
          new Promise(r => {
            resolve = r
          })
      )
    })
    await state.reload()
    state.draft.location = ''
    state.open('profile')
    state.reason = 'Clear outdated location'
    const pending = state.confirm()
    expect(state.busy).toBe(true)
    expect(state.profileLocked).toBe(true)
    expect(state.canLeave()).toBe(false)
    state.draft.location = 'Changed while pending'
    expect(transport.saveAccountProfile.mock.calls[0]?.[1]).toMatchObject({ location: '' })
    resolve({ ...snapshot, profile: { ...snapshot.profile, location: '' }, fingerprint: 'version-two' })
    await pending
    expect(state.draft.location).toBe('')
    expect(state.dirty).toBe(false)
    expect(state.dialog).toBe(false)
  })
  it('suppresses a late account response after another account is selected', async () => {
    let resolve: (value: unknown) => void = () => {}
    const { state } = arrange({
      fetchAccount: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise(r => {
              resolve = r
            })
        )
        .mockResolvedValueOnce({ ...snapshot, id: 8 })
    })
    const pending = state.reload()
    state.$route.params.id = '8'
    await state.reload()
    resolve(snapshot)
    await pending
    expect(state.saved.id).toBe(8)
  })
  it('keeps welcome-mail acceptance separate from a failed history refresh', async () => {
    const { state, transport } = arrange()
    await state.reload()
    state.open('welcome')
    state.reason = 'Welcome this person'
    transport.sendAccountWelcomeEmail.mockResolvedValue({ accepted: true })
    transport.fetchAccount.mockRejectedValue(new Error('Read unavailable'))
    await state.confirm()
    expect(state.notice).toContain('accepted by the mail service')
    expect(state.notice).toContain('Reload to refresh')
    expect(state.actionError).toBe('')
    expect(state.dialog).toBe(false)
  })
  it('retains uncertain outcomes without changing saved status or repeating a request', async () => {
    const { state, transport } = arrange()
    await state.reload()
    state.open('deactivate')
    state.reason = 'Pause the account'
    transport.actOnAccount.mockRejectedValue(new Error('Connection lost'))
    await state.confirm()
    expect(state.actionError).toContain('outcome is unconfirmed')
    expect(state.dialog).toBe(true)
    expect(transport.actOnAccount).toHaveBeenCalledOnce()
    expect(state.saved.fingerprint).toBe('version-one')
  })
  it('clears password entry after successful replacement and keeps credentials out of notices', async () => {
    const { state, transport } = arrange()
    await state.reload()
    state.open('password')
    state.password = 'temporary-password-12'
    state.reason = 'Recovery verified'
    transport.replaceAccountPassword.mockResolvedValue({ ...snapshot, fingerprint: 'new' })
    await state.confirm()
    expect(state.password).toBe('')
    expect(state.notice).not.toContain('temporary-password-12')
    expect(state.dialog).toBe(false)
  })
  it('protects unsaved navigation and synchronizes fragment navigation', async () => {
    const { state, component, window } = arrange()
    await state.reload()
    state.draft.name = 'Unsaved'
    window.confirm.mockReturnValue(false)
    expect(component.beforeRouteLeave.call(state)).toBe(false)
    expect(component.beforeRouteUpdate.call(state, { params: { id: '8' } }, { params: { id: '7' } })).toBe(false)
    expect(component.beforeRouteUpdate.call(state, { params: { id: '7' } }, { params: { id: '7' } })).toBe(true)
    component.watch['$route.hash'].handler.call(state, '#security')
    expect(state.section).toBe('security')
    component.watch['$route.hash'].handler.call(state, '')
    expect(state.section).toBe('profile')
  })
  it('requires both a replacement person and exact account confirmation before deletion', async () => {
    const { state, transport } = arrange()
    await state.reload()
    state.operation = 'delete'
    state.reason = 'Retire old account'
    state.replaceId = 8
    expect(state.canConfirm).toBe(false)
    state.deleteConfirmation = '7'
    expect(state.canConfirm).toBe(true)
    state.replaceId = null
    await state.confirm()
    expect(transport.deleteAccount).not.toHaveBeenCalled()
  })
})
