export interface RenderingProperty {
  type: string
  title?: string
  hint?: string
  default?: unknown
  enum?: string[]
  order?: number
  public?: boolean
}
export interface RenderingSetting { key: string; isEnabled: boolean; config: Record<string, unknown> }
export interface RenderingModule extends RenderingSetting {
  title: string
  description: string
  icon: string
  dependsOn: string | null
  input: string | null
  output: string | null
  step: string | null
  order: number
  props: Record<string, RenderingProperty>
}
export interface RenderingStage { core: RenderingModule; before: RenderingModule[]; after: RenderingModule[] }
export interface RenderingIssue { key: string; severity: 'error' | 'warning'; message: string }
export interface RenderingUsage { contentType: string; pages: number; privatePages: number }
export interface RenderingWorkspace { modules: RenderingModule[]; fingerprint: string; usage: RenderingUsage[] }
export interface RenderingOutput {
  page: { id: number; title: string; path: string; locale: string; visibility: 'public' | 'private'; contentType: string; sourceRevision: string; updatedAt: string }
  html: string
  bytes: number
  headings: { level: number; text: string; id: string }[]
  links: { internal: number; unresolved: number; external: number }
  images: number
  frames: number
}
export const rendererTitle = (module: Pick<RenderingModule, 'title' | 'input' | 'dependsOn'>): string => module.dependsOn || module.title !== 'Core' ? module.title : `${formatTitle(module.input ?? '')} core`
export const formatTitle = (format: string): string => ({ markdown: 'Markdown', html: 'HTML', asciidoc: 'AsciiDoc', openapi: 'OpenAPI' })[format] ?? format
export const renderingSettings = (modules: RenderingModule[]): RenderingSetting[] => modules.map(({ key, isEnabled, config, props }) => ({ key, isEnabled, config: Object.fromEntries(Object.entries(config).filter(([name]) => Object.hasOwn(props, name))) }))
export const buildRenderingPlan = (modules: RenderingModule[], contentType: string): RenderingStage[] => {
  const cores = modules.filter(module => module.isEnabled && !module.dependsOn)
  const ordered: RenderingModule[] = [], visited = new Set<string>(), visiting = new Set<string>()
  const visit = (core: RenderingModule) => {
    if (visiting.has(core.key)) throw new Error('The rendering pipeline contains a format cycle.')
    if (visited.has(core.key)) return
    visiting.add(core.key)
    for (const next of cores) if (next.key !== core.key && next.input === core.output) visit(next)
    visiting.delete(core.key); visited.add(core.key); ordered.push(core)
  }
  for (const core of cores) if (core.input === contentType) visit(core)
  return ordered.reverse().map(core => {
    const children = modules.filter(module => module.isEnabled && module.dependsOn === core.key)
    return { core, before: children.filter(module => core.key !== 'htmlCore' || module.step !== 'post'), after: core.key === 'htmlCore' ? children.filter(module => module.step === 'post').sort((a, b) => a.order - b.order) : [] }
  })
}
export const renderingIssues = (modules: RenderingModule[], contentTypes: string[] = []): RenderingIssue[] => {
  const issues: RenderingIssue[] = []
  for (const module of modules) {
    if (module.dependsOn && module.isEnabled && !modules.some(parent => parent.key === module.dependsOn && parent.isEnabled)) issues.push({ key: module.key, severity: 'warning', message: `${rendererTitle(module)} is enabled but paused because its core is disabled or missing.` })
    for (const [key, prop] of Object.entries(module.props)) {
      const value = module.config[key], label = `${rendererTitle(module)} · ${prop.title || key}`
      if ((prop.type === 'boolean' && typeof value !== 'boolean') || (prop.type === 'string' && typeof value !== 'string') || (prop.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value)))) issues.push({ key: module.key, severity: 'error', message: `${label} requires a ${prop.type} value.` })
      else if (prop.enum && !prop.enum.includes(String(value))) issues.push({ key: module.key, severity: 'error', message: `${label} must use one of the listed options.` })
    }
    if (module.key === 'markdownExpandtabs' && (!Number.isSafeInteger(module.config.tabWidth) || Number(module.config.tabWidth) < 1 || Number(module.config.tabWidth) > 32)) issues.push({ key: module.key, severity: 'error', message: 'Tab width must be a whole number from 1 to 32.' })
    if (['markdownPlantuml', 'markdownKroki'].includes(module.key)) {
      try { const url = new URL(String(module.config.server)); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error() } catch { issues.push({ key: module.key, severity: 'error', message: `${rendererTitle(module)} requires an HTTP or HTTPS server URL without embedded credentials.` }) }
      if (typeof module.config.openMarker !== 'string' || !module.config.openMarker.trim() || typeof module.config.closeMarker !== 'string' || !module.config.closeMarker.trim() || module.config.openMarker === module.config.closeMarker) issues.push({ key: module.key, severity: 'error', message: `${rendererTitle(module)} needs distinct, nonempty opening and closing markers.` })
    }
  }
  for (const contentType of new Set(contentTypes)) {
    try { const plan = buildRenderingPlan(modules, contentType); if (!plan.length) issues.push({ key: contentType, severity: 'warning', message: `${formatTitle(contentType)} has no enabled parser. Stored pages keep their previous output until rendered again.` }); else if (plan.at(-1)?.core.key !== 'htmlCore') issues.push({ key: contentType, severity: 'warning', message: `${formatTitle(contentType)} bypasses HTML post-processing, including link handling and HTML sanitization.` }) } catch (error) { issues.push({ key: contentType, severity: 'error', message: error instanceof Error ? error.message : 'Invalid rendering pipeline.' }) }
  }
  const html = modules.find(module => module.key === 'htmlCore'), security = modules.find(module => module.key === 'htmlSecurity')
  if (html?.isEnabled && (!security?.isEnabled || security.config.safeHTML !== true)) issues.push({ key: 'htmlSecurity', severity: 'warning', message: 'HTML sanitization is disabled. Authored HTML may reach readers without the renderer’s safety filter.' })
  if (html?.isEnabled && security?.isEnabled && security.config.safeHTML === true && security.config.allowIFrames === true) issues.push({ key: 'htmlSecurity', severity: 'warning', message: 'Embedded frames are allowed in rendered HTML and can load third-party content.' })
  if (modules.some(module => module.key === 'markdownKatex' && module.isEnabled) && modules.some(module => module.key === 'markdownMathjax' && module.isEnabled)) issues.push({ key: 'markdownMathjax', severity: 'warning', message: 'KaTeX and MathJax are both enabled. They can compete for the same math delimiters; choose one engine for predictable results.' })
  return issues
}
