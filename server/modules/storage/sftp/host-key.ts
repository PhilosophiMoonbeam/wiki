import { createHash, timingSafeEqual } from 'node:crypto'
import { isStorageHostKeyFingerprint } from '../../../../shared/storage-workspace.ts'

export const storageHostVerifier = (fingerprint: string): ((key: Buffer) => boolean) => {
  const value = fingerprint.trim()
  if (!isStorageHostKeyFingerprint(value)) throw new Error('Provide the server’s verified SHA256 host-key fingerprint before connecting.')
  const expected = Buffer.from(value.slice('SHA256:'.length), 'base64')
  return key => Buffer.isBuffer(key) && timingSafeEqual(expected, createHash('sha256').update(key).digest())
}
