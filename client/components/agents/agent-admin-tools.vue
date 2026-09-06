<template>
  <section class="tool-workspace" aria-labelledby="tool-directory-title">
    <header>
      <div class="tool-eyebrow">Capabilities & connections</div>
      <h2 id="tool-directory-title">Tools & MCP</h2>
      <p>See what this deployment can offer to the Wiki Agent and connected clients.</p>
    </header>
    <div class="mcp-connection">
      <div>
        <h3>Connect another agent</h3>
        <p>Use Streamable HTTP and an API key bound to this MCP resource. The key's group determines its page access.</p>
        <v-chip size="small" :color="loaded ? mcpEnabled ? 'success' : 'warning' : undefined" variant="tonal">{{ !loaded ? 'State unavailable' : mcpEnabled ? 'MCP enabled in deployment' : 'MCP disabled in deployment' }}</v-chip>
      </div>
      <div class="mcp-connection__endpoint">
        <span>MCP resource URL</span>
        <div class="mcp-connection__url"><code id="agent-mcp-endpoint">{{ endpoint }}</code><v-btn icon="mdi-content-copy" size="small" variant="text" aria-label="Copy MCP resource URL" @click="copyEndpoint" /></div>
        <span v-if="copyMessage" role="status">{{ copyMessage }}</span>
        <a href="/a/api">Manage API keys and integration setup <v-icon size="16">mdi-arrow-right</v-icon></a>
      </div>
    </div>
    <div class="tool-toolbar" role="search" aria-label="Find agent tools">
      <v-text-field v-model="query" label="Find a tool" prepend-inner-icon="mdi-magnify" clearable hide-details />
      <v-select v-model="transport" label="Available to" :items="transports" hide-details />
      <v-select v-model="state" label="Deployment state" :items="states" hide-details />
    </div>
    <p class="tool-explanation">Deployment eligibility is only the first check. User permissions, page rules, selected skills, model capabilities and approvals still apply. This list does not test a client connection.</p>
    <v-skeleton-loader v-if="!loaded && loading" type="list-item-three-line, list-item-three-line" />
    <v-alert v-else-if="!loaded" type="info" variant="tonal">Tool policy could not be loaded. Use Refresh status to try again.</v-alert>
    <template v-else>
      <p class="tool-count" role="status">{{ filteredTools.length }} of {{ tools.length }} tools</p>
      <div class="tool-directory">
        <details v-for="tool in filteredTools" :key="tool.name" class="tool-record">
          <summary>
            <v-icon size="20">{{ tool.risk === 'read' ? 'mdi-book-search-outline' : tool.risk === 'open-world-read' ? 'mdi-web' : 'mdi-pencil-lock-outline' }}</v-icon>
            <span class="tool-record__name"><strong>{{ tool.title }}</strong><code>{{ tool.toolName }}</code></span>
            <span class="tool-record__state">{{ eligible(tool) ? 'Eligible' : 'Deployment blocked' }}</span>
            <v-icon size="18">mdi-chevron-down</v-icon>
          </summary>
          <div class="tool-record__details">
            <p>{{ tool.description }}</p>
            <dl>
              <div><dt>Effect</dt><dd>{{ riskLabels[tool.risk] }}</dd></div>
              <div><dt>Permissions</dt><dd>{{ tool.requiredPermissions.join(', ') || 'Authenticated access; resource rules apply' }}</dd></div>
              <div><dt>Wiki Agent</dt><dd>{{ exposureDescription(tool.exposure.agent, tool.agentBlockers) }}</dd></div>
              <div><dt>MCP clients</dt><dd>{{ exposureDescription(tool.exposure.mcp, tool.mcpBlockers) }}</dd></div>
            </dl>
          </div>
        </details>
      </div>
      <div v-if="!filteredTools.length" class="tool-empty">
        <h3>{{ tools.length ? 'No tools match these filters' : 'Tool inventory unavailable' }}</h3>
        <p>{{ tools.length ? 'Try another capability, permission or deployment state.' : 'Refresh after the server and client have both been updated.' }}</p>
        <v-btn v-if="tools.length" variant="tonal" @click="query = ''; transport = 'all'; state = 'all'">Clear filters</v-btn>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AgentAdminTool } from '../../../shared/agents/admin.ts'

const { tools, loaded, loading, mcpEnabled } = defineProps<{ tools: AgentAdminTool[]; loaded: boolean; loading: boolean; mcpEnabled: boolean }>()
const query = ref<string | null>('')
const transport = ref<'all' | 'agent' | 'mcp'>('all')
const state = ref('all')
const copyMessage = ref('')
const endpoint = new URL('/mcp', window.location.origin).href
const transports = [{ title: 'Either interface', value: 'all' }, { title: 'Wiki Agent', value: 'agent' }, { title: 'MCP clients', value: 'mcp' }]
const states = [{ title: 'All states', value: 'all' }, { title: 'Eligible', value: 'eligible' }, { title: 'Deployment blocked', value: 'blocked' }]
const riskLabels = { read: 'Read only', 'open-world-read': 'External browsing', proposal: 'Prepares a change for review', 'reversible-write': 'Changes stored data', 'destructive-write': 'Applies an approved change' }
const eligible = (tool: AgentAdminTool) =>
  (transport.value !== 'mcp' && tool.exposure.agent && !tool.agentBlockers.length) ||
  (transport.value !== 'agent' && tool.exposure.mcp && !tool.mcpBlockers.length)
const filteredTools = computed(() => {
  const terms = (query.value || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return tools.filter(tool => (transport.value === 'all' || tool.exposure[transport.value]) &&
    (state.value === 'all' || eligible(tool) === (state.value === 'eligible')) &&
    terms.every(term => `${tool.title} ${tool.toolName} ${tool.description} ${tool.requiredPermissions.join(' ')}`.toLocaleLowerCase().includes(term)))
})
const exposureDescription = (exposed: boolean, blockers: readonly string[]) => !exposed ? 'Not exposed on this interface' : blockers.length ? `Enable ${blockers.join(', ')}` : 'Eligible, subject to request authorization'
async function copyEndpoint() {
  try { await navigator.clipboard.writeText(endpoint); copyMessage.value = 'Resource URL copied' }
  catch { copyMessage.value = 'Copy unavailable. Select and copy the resource URL above.' }
}
</script>

<style scoped>
.tool-workspace { padding: clamp(1rem, 3vw, 2rem); background: var(--wiki-surface-raised); border: 1px solid var(--wiki-surface-border); border-radius: var(--wiki-panel-radius); }
.tool-eyebrow { color: var(--wiki-accent-ink); font-size: .75rem; letter-spacing: .1em; text-transform: uppercase; }
h2 { font: 500 1.7rem var(--wiki-font-display); margin-block: .35rem; }
h3 { font-size: 1rem; }
p { font-size: .9rem; line-height: 1.65; margin-block: .5rem 1rem; }
.mcp-connection { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; padding-block: 1.5rem; margin-block: 1rem 1.5rem; border-block: 1px solid var(--wiki-surface-border); }
.mcp-connection > div { min-width: 0; }
.mcp-connection__endpoint { display: flex; flex-direction: column; gap: .6rem; font-size: .8rem; }
.mcp-connection__url { display: flex; align-items: center; gap: .5rem; padding: .6rem; background: var(--wiki-surface-sunken); border: 1px solid var(--wiki-surface-border); border-radius: var(--wiki-control-radius); }
.mcp-connection__url code { flex: 1; overflow-wrap: anywhere; }
a { color: var(--wiki-accent-ink); }
.tool-toolbar { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: .75rem; }
.tool-explanation, .tool-count { font-size: .8rem; }
.tool-directory { border-top: 1px solid var(--wiki-surface-border); }
.tool-record { border-bottom: 1px solid var(--wiki-surface-border); }
summary { display: flex; align-items: center; gap: .8rem; padding-block: 1rem; cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary:focus-visible { outline: 2px solid var(--wiki-accent-ink); outline-offset: 3px; }
.tool-record__name { display: grid; gap: .2rem; flex: 1; min-width: 0; }
.tool-record__name strong { font-size: .9rem; }
code { font-family: var(--wiki-font-mono); font-size: .75rem; overflow-wrap: anywhere; }
.tool-record__state { font-size: .75rem; }
.tool-record__details { padding: 0 1rem 1rem 2rem; }
dl { display: grid; gap: .75rem; font-size: .8rem; }
dl > div { display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: 1rem; }
dt { font-weight: 600; }
dd { margin: 0; overflow-wrap: anywhere; }
.tool-empty { text-align: center; padding: 2rem; }
@media (max-width: 1100px) { .mcp-connection, .tool-toolbar { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) { .tool-record__state { max-width: 5rem; } .tool-record__details { padding-inline: 0; } dl > div { grid-template-columns: 1fr; gap: .25rem; } }
</style>
