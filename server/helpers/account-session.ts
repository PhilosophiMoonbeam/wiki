/** A missing version is the pre-migration session generation, never a bypass. */
export const sessionVersion = (value: unknown): number | null => value === undefined ? 0 : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647 ? value : null
export const accountSessionIsCurrent = (claims: { id?: unknown; authVersion?: unknown }, account: { id?: unknown; isActive?: unknown; authVersion?: unknown } | null | undefined): boolean => {
  if (!account || !Number.isSafeInteger(claims.id) || Number(claims.id) < 1 || claims.id === 2 || claims.id !== account.id || account.isActive !== true) return false
  const issued = sessionVersion(claims.authVersion), current = sessionVersion(account.authVersion)
  return issued !== null && current !== null && issued === current
}
