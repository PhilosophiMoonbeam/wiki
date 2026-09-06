import { resolveTagName } from './tag-aliases.ts'
import type { GroupRuleMatch } from '../../shared/group-policy.ts'
export interface AccessRule {
  id?: string
  match: GroupRuleMatch
  path: string
  deny: boolean
  roles: string[]
  locales?: string[]
}
export interface AccessGroup {
  id: number
  name?: string
  pageRules: AccessRule[]
}
export interface AccessPage {
  path: string
  locale?: string
  tags?: Array<{ tag: string }>
}
export interface RuleState {
  deny: boolean
  match: GroupRuleMatch | false
  specificity: string
}
const rank: Record<GroupRuleMatch, number> = { START: 0, END: 1, REGEX: 2, TAG: 3, EXACT: 4 }
export const applyPageRule = (rule: AccessRule, state: RuleState): RuleState => {
  if (rule.path.length < state.specificity.length) return state
  if (rule.path.length === state.specificity.length && state.match !== false) {
    if (rank[rule.match] < rank[state.match] || (rule.match === state.match && state.deny && !rule.deny)) return state
  }
  return { deny: rule.deny, match: rule.match, specificity: rule.path }
}
export const evaluateGroupAccess = (
  permissions: string[],
  requested: string[],
  groups: AccessGroup[],
  page?: AccessPage | false,
  aliases: Record<string, string | null> = {},
  collectTrace = true
) => {
  const bypass = permissions.includes('manage:system'),
    hasPermission = requested.some(p => permissions.includes(p))
  let state: RuleState = { deny: false, match: false, specificity: '' }
  const trace: Array<{
    groupId: number
    groupName: string
    ruleId: string
    match: GroupRuleMatch
    path: string
    deny: boolean
    outcome: 'overridden' | 'no-match' | 'locale' | 'permission'
  }> = []
  if (page)
    for (const group of groups)
      for (const [index, rule] of group.pageRules.entries()) {
        let outcome: 'overridden' | 'no-match' | 'locale' | 'permission' = 'no-match',
          matches = false
        if (rule.locales?.length && (!page.locale || !rule.locales.includes(page.locale))) outcome = 'locale'
        else if (!rule.roles.some(role => requested.includes(role))) outcome = 'permission'
        else {
          if (rule.match === 'START') matches = `/${page.path}`.startsWith(`/${rule.path}`)
          if (rule.match === 'END') matches = page.path.endsWith(rule.path)
          if (rule.match === 'EXACT') matches = `/${page.path}` === `/${rule.path}`
          if (rule.match === 'REGEX') {
            try {
              matches = new RegExp(rule.path).test(page.path)
            } catch {
              matches = false
            }
          }
          if (rule.match === 'TAG') {
            const resolved = resolveTagName(aliases, rule.path)
            matches = resolved !== null && (page.tags ?? []).some(tag => resolveTagName(aliases, tag.tag) === resolved)
          }
          if (matches) {
            outcome = 'overridden'
            state = applyPageRule(rule, state)
          }
        }
        if (collectTrace)
          trace.push({
            groupId: group.id,
            groupName: group.name ?? `Group ${group.id}`,
            ruleId: rule.id ?? String(index + 1),
            match: rule.match,
            path: rule.path,
            deny: rule.deny,
            outcome
          })
      }
  const rules = trace.map(rule => ({
    ...rule,
    outcome:
      rule.outcome === 'overridden' && rule.path.length === state.specificity.length && rule.match === state.match && rule.deny === state.deny
        ? ('winner' as const)
        : rule.outcome
  }))
  return {
    allowed: bypass || (hasPermission && (!page || (state.match !== false && !state.deny))),
    reason: bypass
      ? 'Full system administration bypasses page rules.'
      : !hasPermission
        ? 'The required global permission is missing.'
        : !page
          ? 'The global permission is granted.'
          : state.match === false
            ? 'No page rule grants this action.'
            : state.deny
              ? 'The highest-priority matching rule denies this action.'
              : 'The highest-priority matching rule allows this action.',
    rules
  }
}
