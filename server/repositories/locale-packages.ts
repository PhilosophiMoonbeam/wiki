import { LocaleCodeSchema } from '../../shared/locale-policy.ts'
import { LocaleCatalogResponseSchema, parseLocaleStrings } from '../helpers/locale-package.ts'
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
export const requestLocaleSource = async (
  endpoint: string,
  query: string,
  variables: Record<string, string> | undefined,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> => {
  const deadline = AbortSignal.timeout(20_000)
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    redirect: 'error',
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, ...(variables ? { variables } : {}) })
  })
  if (!response.ok) throw new Error('The language source returned an unsuccessful response.')
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES || !response.body)
    throw new Error('The language source response is too large or empty.')
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      signal?.throwIfAborted()
      deadline.throwIfAborted()
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new Error('The language source response exceeds the size limit.')
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as unknown
}
export const fetchLocaleCatalog = async (endpoint: string, signal?: AbortSignal, fetchImpl?: typeof fetch) =>
  LocaleCatalogResponseSchema.parse(
    await requestLocaleSource(
      endpoint,
      '{ localization { locales { availability code name nativeName isRTL createdAt updatedAt } } }',
      undefined,
      signal,
      fetchImpl
    )
  ).data.localization.locales
export const fetchLocaleStrings = async (endpoint: string, code: string, signal?: AbortSignal, fetchImpl?: typeof fetch) =>
  parseLocaleStrings(
    await requestLocaleSource(
      endpoint,
      'query ($code: String!) { localization { strings(code: $code) { key value } } }',
      { code: LocaleCodeSchema.parse(code) },
      signal,
      fetchImpl
    )
  )
