import { execFileSync } from 'node:child_process'
import { describe, it, expect } from '../server/test/bun-test.mts'
import { isStorageGitBranchName, storageConfigurationIssues, storageActionDefinition } from './storage-workspace.ts'
describe('Storage configuration and effect contracts', () => {
  it('matches Git literal branch validation including components, Unicode and option-like input', () => {
    for (const name of [
      'main',
      'release/next',
      '@',
      'foo]bar',
      'foo\u00a0bar',
      'a./b',
      '-bad',
      'foo bar',
      'foo\x7fbar',
      '.hidden',
      'a/.hidden',
      'a.lock/b',
      '/foo',
      'foo//bar',
      'foo/',
      'foo..bar',
      'foo~bar',
      'foo^bar',
      'foo:bar',
      'foo?bar',
      'foo*bar',
      'foo[bar',
      'foo\\bar',
      'foo@{bar',
      'foo.',
      'foo.lock',
      'main\n'
    ]) {
      let valid = true
      try {
        execFileSync('git', ['check-ref-format', '--branch', name], { stdio: 'ignore' })
      } catch {
        valid = false
      }
      expect(isStorageGitBranchName(name)).toBe(valid)
    }
    expect(isStorageGitBranchName('@{-1}')).toBe(false)
  })
  it('describes real archive and Git recreation effects, without promising a full workspace backup', () => {
    expect(storageActionDefinition('disk', 'backup')?.effect).toContain('does not first refresh files from the database')
    expect(storageActionDefinition('git', 'purge')?.effect).toContain('ensuing synchronization can affect the remote repository')
    expect(storageActionDefinition('git', 'syncUntracked')?.effect).toContain('overwritten')
    expect(storageActionDefinition('s3', 'purge')).toBeNull()
  })
  it('permits the bundled S3 runtime credential provider and requires complete explicit credential pairs', () => {
    const target = { key: 's3', config: { bucket: 'wiki', region: 'us-east-1', accessKeyId: '' }, secrets: { secretAccessKey: false } }
    expect(storageConfigurationIssues(target)).toEqual([])
    target.config.accessKeyId = 'key'
    expect(storageConfigurationIssues(target)).toHaveLength(1)
    target.secrets.secretAccessKey = true
    expect(storageConfigurationIssues(target)).toEqual([])
  })
  it('rejects command interpolation in key paths and preserves literal branch validation', () => {
    const target = {
      key: 'git',
      config: {
        repoUrl: 'git@example.test:wiki/repo.git',
        branch: 'main',
        localRepoPath: './data/repo',
        defaultName: 'Wiki',
        defaultEmail: 'wiki@example.test',
        authType: 'ssh',
        sshPrivateKeyMode: 'path',
        sshPrivateKeyPath: '/keys/wiki'
      },
      secrets: {}
    }
    expect(storageConfigurationIssues(target)).toEqual([])
    target.config.sshPrivateKeyPath = '/keys/$(command)'
    expect(storageConfigurationIssues(target)).toContain('The private-key path contains unsupported command characters.')
    target.config.sshPrivateKeyPath = '/keys/wiki'
    target.config.branch = ' main '
    expect(storageConfigurationIssues(target)).toContain('Enter a valid Git branch name.')
  })
})
