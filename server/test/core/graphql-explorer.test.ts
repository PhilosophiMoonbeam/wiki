import { describe, expect, it } from '../bun-test.mts'
import { buildSchema, parse, validate } from 'graphql'
import { GRAPHQL_EXPLORER_OPTIONS, GRAPHQL_STARTERS, renderWorkspaceGraphiQL } from '../../core/graphql-explorer.ts'
import fs from 'node:fs'
import path from 'node:path'

describe('GraphQL administration workspace', () => {
  it('keeps headers out of persistent IDE settings and supplies a useful read-only starting point', () => {
    expect(GRAPHQL_EXPLORER_OPTIONS).toMatchObject({ credentials: 'same-origin', shouldPersistHeaders: false, subscriptionsProtocol: 'WS' })
    expect(GRAPHQL_EXPLORER_OPTIONS.defaultQuery).toContain('PageInventory')
    const html = renderWorkspaceGraphiQL(GRAPHQL_EXPLORER_OPTIONS)
    expect(html).toContain('href="/a/api#explore"')
    expect(html).toContain('aria-controls="workspace-guide"')
    expect(html).toContain('Header persistence is disabled')
    expect(html).not.toContain('__TITLE__')
    expect(html).not.toContain('https://unpkg.com')
    expect(html).not.toContain('https://raw.githubusercontent.com')
    expect(html).toContain('/_assets/graphiql/4.4.4/yoga-graphiql.umd.js')
  })
  it('validates every starter against the actual schema documents', () => {
    const root = path.join(process.cwd(), 'server/graph/schemas')
    const schema = buildSchema('directive @rateLimit(limit: Int, duration: Int) on FIELD_DEFINITION\n' + fs.readdirSync(root).filter(name => name.endsWith('.graphql')).map(name => fs.readFileSync(path.join(root, name), 'utf8')).join('\n'))
    for (const starter of Object.values(GRAPHQL_STARTERS)) {
      const document = parse(starter.query)
      expect(validate(schema, document).map(error => error.message)).toEqual([])
      expect(document.definitions.every(node => node.kind === 'OperationDefinition' && node.operation === 'query')).toBe(true)
    }
  })
})
