import { beforeEach, describe, expect, it, vi } from '../bun-test.mts'
let verify: (...args: unknown[]) => Promise<void> = async () => {},
  user: Record<string, unknown>
class Strategy {
  constructor(...args: unknown[]) {
    verify = args.find(value => typeof value === 'function') as typeof verify
  }
}
const synchronize = vi.fn(),
  processProfile = vi.fn(),
  wiki = { models: { users: { processProfile } }, config: { flags: { ldapdebug: false } }, logger: { warn: vi.fn() } }
vi.mockModule('../../modules/types.ts', import.meta.url, () => ({
  wiki,
  asError: (value: unknown) => (value instanceof Error ? value : new Error(String(value)))
}))
vi.mockModule('../../helpers/authentication-provisioning.ts', import.meta.url, () => ({ synchronizeProviderGroups: synchronize }))
vi.mockModule('passport-openidconnect', import.meta.url, () => ({ default: { Strategy } }))
vi.mockModule('@node-saml/passport-saml', import.meta.url, () => ({ Strategy }))
vi.mockModule('openid-client', import.meta.url, () => ({ discovery: async () => ({}) }))
vi.mockModule('openid-client/passport', import.meta.url, () => ({ Strategy }))
vi.mockModule('../../modules/authentication/ldap/ldap-strategy.ts', import.meta.url, () => ({ LdapStrategy: Strategy }))
beforeEach(() => {
  user = { id: 3, authVersion: 1, groups: [{ id: 99 }] }
  processProfile.mockReset().mockResolvedValue(user)
  synchronize.mockReset().mockResolvedValue({ authVersion: 2, adminRevision: 'mapped', changed: true })
})
async function run(kind: string, names: string[] | undefined, callback: ReturnType<typeof vi.fn>) {
  const { default: plugin } = await vi.importFresh(`../../modules/authentication/${kind}/authentication.ts`, import.meta.url)
  const conf = {
    key: 'organization',
    mapGroups: true,
    callbackURL: 'https://wiki.example.invalid/login/organization/callback',
    entryPoint: 'https://identity.example.invalid',
    signatureAlgorithm: 'sha256',
    racComparison: 'exact',
    groupSearchScope: 'sub',
    groupNameField: 'cn',
    mappingUID: 'uid',
    mappingEmail: 'email',
    mappingDisplayName: 'name',
    mappingPicture: 'picture',
    mappingGroups: 'memberOf',
    groupsClaim: 'groups',
    emailClaim: 'email',
    displayNameClaim: 'name',
    pictureClaim: 'picture',
    tlsEnabled: false
  }
  await plugin.init({ use: vi.fn() }, conf)
  const req = { params: { strategy: 'organization' } }
  if (kind === 'oidc') await verify(req, 'issuer', { _json: { groups: names, email: 'person@example.invalid' } }, {}, null, null, null, null, null, callback)
  else if (kind === 'azure') await verify(req, { claims: () => ({ groups: names, email: 'person@example.invalid', sub: 'subject' }) }, callback)
  else
    await verify(
      req,
      { uid: 'subject', email: 'person@example.invalid', name: 'Person', _groups: names?.map(cn => ({ cn })), attributes: { memberOf: names } },
      callback
    )
}
describe('directory mapping protocol adapters', () => {
  for (const kind of ['ldap', 'oidc', 'saml', 'azure']) {
    it(`${kind} forwards the claim to the shared transaction and refreshes token state`, async () => {
      const callback = vi.fn()
      await run(kind, ['Readers'], callback)
      expect(synchronize).toHaveBeenCalledWith({ userId: 3, providerKey: 'organization', groupNames: ['Readers'] })
      expect(user.authVersion).toBe(2)
      expect(user.groups).toBeUndefined()
      expect(callback).toHaveBeenCalledWith(null, user)
    })
    it(`${kind} distinguishes an absent claim from an explicitly empty claim`, async () => {
      const callback = vi.fn()
      await run(kind, undefined, callback)
      expect(synchronize).not.toHaveBeenCalled()
      await run(kind, [], callback)
      expect(synchronize).toHaveBeenCalledWith({ userId: 3, providerKey: 'organization', groupNames: [] })
    })
    it(`${kind} fails sign-in when current membership synchronization fails`, async () => {
      const callback = vi.fn()
      synchronize.mockRejectedValue(new Error('Provider is unavailable'))
      await run(kind, ['Readers'], callback)
      expect(callback.mock.calls[0]?.[0]).toBeInstanceOf(Error)
      expect(user.authVersion).toBe(1)
    })
  }
})
