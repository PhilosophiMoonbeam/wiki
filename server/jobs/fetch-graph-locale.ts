import { getLocaleAdministrationStore } from '../operations/locale-administration.ts'
import type { PagePrincipal } from '../helpers/page-access.ts'
/** Compatibility scheduler entry: require an attributed request and enqueue the durable operation. */
export default async function fetchGraphLocale(input: { code: string; requester: PagePrincipal }): Promise<void> {
  if (!input || typeof input !== 'object' || !input.requester) throw new Error('Language installation requires an attributed administrative request.')
  const store = getLocaleAdministrationStore(),
    saved = await store.inspect(input.requester)
  await store.enqueue(input.requester, {
    kind: 'install',
    code: input.code,
    fingerprint: saved.fingerprint,
    reason: 'Install language package through the scheduler compatibility entry'
  })
}
