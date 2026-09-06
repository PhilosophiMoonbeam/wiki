import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, test } from '../../../server/test/bun-test.mts'

const adminComponentDirectory = join(process.cwd(), 'client/components/admin')
const routerSource = readFileSync(join(process.cwd(), 'client/router.ts'), 'utf8')

const routedAdminPageFiles = [
  'admin-dashboard.vue',
  'admin-general.vue',
  'admin-locale.vue',
  'admin-navigation.vue',
  'admin-pages.vue',
  'admin-pages-edit.vue',
  'admin-pages-visualize.vue',
  'admin-tags.vue',
  'admin-theme.vue',
  'admin-groups.vue',
  'admin-groups-edit.vue',
  'admin-users.vue',
  'admin-users-edit.vue',
  'admin-analytics.vue',
  'admin-auth.vue',
  'admin-comments.vue',
  'admin-rendering.vue',
  'admin-editor.vue',
  'admin-extensions.vue',
  'admin-logging.vue',
  'admin-search.vue',
  'admin-agents.vue',
  'admin-storage.vue',
  'admin-api.vue',
  'admin-mail.vue',
  'admin-security.vue',
  'admin-ssl.vue',
  'admin-system.vue',
  'admin-utilities.vue',
  'admin-webhooks.vue',
  'admin-dev-flags.vue'
] as const

const legacyHeaderClass = /\.admin-header(?![\w-])/
const legacyHeaderTitleClass = /\.admin-header-title(?![\w-])/
const adminHeroElement = /(?:^|\n)\s*<?(?:admin-hero|AdminHero)(?=[.(\s>/]|$)/

describe('routed administration page AdminHero migration', () => {
  test('enumerates the complete routed page set without nested components or the orphan stats page', () => {
    const filesFromRouter = Array.from(
      routerSource.matchAll(/component:\s*\(\)\s*=>\s*import\((['"])\.\/components\/admin\/([^'"]+\.vue)\1\)/g),
      match => match[2]
    )

    expect(filesFromRouter).toEqual([...routedAdminPageFiles])
    expect(routedAdminPageFiles).not.toContain('admin-stats.vue')
  })

  test.each(routedAdminPageFiles)('%s uses AdminHero without legacy header markup', fileName => {
    const componentPath = join(adminComponentDirectory, fileName)
    const source = readFileSync(componentPath, 'utf8')
    const { descriptor, errors } = parse(source, { filename: componentPath })
    const template = descriptor.template?.content ?? ''

    expect(errors).toEqual([])
    expect(template).toMatch(adminHeroElement)
    expect(template).not.toMatch(legacyHeaderClass)
    expect(template).not.toMatch(legacyHeaderTitleClass)
  })

  test('keeps every Pages AdminHero child in a named slot', () => {
    const componentPath = join(adminComponentDirectory, 'admin-pages.vue')
    const source = readFileSync(componentPath, 'utf8')
    const { descriptor, errors } = parse(source, { filename: componentPath })
    const container = descriptor.template?.ast?.children.find(node => node.type === 1 && node.tag === 'v-container')
    const hero = container?.type === 1 ? container.children.find(node => node.type === 1 && node.tag === 'admin-hero') : undefined
    const heroChildren = hero?.type === 1 ? hero.children.filter(node => node.type !== 3 && !(node.type === 2 && !node.content.trim())) : []

    expect(errors).toEqual([])
    expect(heroChildren.length).toBeGreaterThan(0)
    expect(heroChildren.every(child => child.type === 1 && child.tag === 'template' && child.props.some(prop => prop.type === 7 && prop.name === 'slot' && prop.arg?.type === 4 && prop.arg.content === 'actions'))).toBe(true)
  })

  test('removes shared legacy header CSS while preserving artifact-free route heading focus', () => {
    const shellPath = join(process.cwd(), 'client/components/admin.vue')
    const shellSource = readFileSync(shellPath, 'utf8')
    const { descriptor, errors } = parse(shellSource, { filename: shellPath })
    const shellStyles = descriptor.styles.map(style => style.content).join('\n')

    expect(errors).toEqual([])
    expect(shellStyles).not.toMatch(legacyHeaderClass)
    expect(shellStyles).not.toMatch(legacyHeaderTitleClass)
    expect(shellStyles).toMatch(/h1\[tabindex='-1'\]:focus\s*\{\s*outline:\s*none;\s*box-shadow:\s*none;/)
    expect(shellSource).toContain('heading.focus({ preventScroll: true })')
  })
})
