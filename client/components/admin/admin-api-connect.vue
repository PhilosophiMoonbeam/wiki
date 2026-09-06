<template>
  <div class="api-connect">
    <div class="connect-heading"><span class="connect-kicker">Integration workbench</span><h2>Choose your connection.</h2><p>REST for straightforward resource access, GraphQL for precise queries, and MCP for external agents. All three enforce the key’s permissions and page rules.</p></div>
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">Connection settings could not be loaded. <v-btn variant="text" @click="$emit('retry')">Retry</v-btn></v-alert>
    <v-progress-linear v-if="loading" indeterminate color="primary" aria-label="Loading connection settings" />
    <v-radio-group v-model="protocol" inline label="Client protocol" color="primary"><v-radio label="REST v1" value="rest" /><v-radio label="GraphQL" value="graphql" /><v-radio label="MCP" value="mcp" /></v-radio-group>
    <div class="connect-grid">
      <section class="connect-panel"><span class="connect-kicker">01 / Endpoint</span><h3>{{ protocolTitle }}</h3><code class="endpoint-value">{{ endpoint || 'Canonical MCP resource unavailable' }}</code>
        <p v-if="protocol === 'mcp'">Use Streamable HTTP with a key issued for the exact resource above. A browser session cannot authenticate an MCP client.</p><p v-else>Authenticate each request with <code>Authorization: Bearer &lt;API_KEY&gt;</code>. Keep the credential in your client’s secret storage.</p>
        <v-alert v-if="protocol === 'mcp' && connections && !connections.mcpEnabled" type="warning" variant="tonal">MCP is disabled in this deployment. Configure the runtime before creating an MCP credential.</v-alert><v-alert v-if="protocol === 'mcp' && connections?.mcpConfigurationError" type="error" variant="tonal">The configured public origin cannot produce a valid MCP resource. Review General settings and deployment configuration.</v-alert>
        <dl class="connection-facts"><div><dt>API-key authentication</dt><dd>{{ enabled ? 'Enabled' : 'Disabled' }}</dd></div><div><dt>Authorization</dt><dd>Issued group’s current permissions and page rules</dd></div><div v-if="protocol === 'mcp'"><dt>MCP runtime</dt><dd>{{ connections ? connections.mcpEnabled ? 'Configured as enabled' : 'Disabled' : 'Not loaded' }}</dd></div></dl>
        <p class="connection-note">Configuration is shown here; it is not a connection health check.</p><div class="connection-actions"><v-btn variant="outlined" prepend-icon="mdi-content-copy" :disabled="!endpoint" @click="copy(endpoint || '')">Copy endpoint</v-btn><v-btn variant="text" @click="$emit('create')">Create a key</v-btn></div>
      </section>
      <section class="connect-example"><span class="connect-kicker">02 / First request</span><h3>{{ protocol === 'mcp' ? 'Configure your agent client' : 'Read a small page inventory' }}</h3><p>{{ protocol === 'mcp' ? 'Enter the endpoint and bearer credential in your client’s Streamable HTTP connection settings. Field names vary between clients.' : 'Set WIKI_API_KEY in your shell environment, then run this read-only example. The key needs read:pages or system-administrator access.' }}</p>
        <pre tabindex="0" :aria-label="protocolTitle + ' connection example'">{{ example }}</pre><v-btn variant="text" prepend-icon="mdi-content-copy" :disabled="!endpoint" @click="copy(example)">Copy example</v-btn><p v-if="copied" class="connection-note" role="status">{{ copied }}</p>
        <p v-if="protocol === 'mcp'" class="connection-note">MCP-capable keys also work with REST and GraphQL. Keys created without MCP access have no resource binding and cannot authenticate MCP requests. Create a replacement when the canonical resource changes.</p>
        <a v-if="protocol === 'rest'" :href="openApiEndpoint" target="_blank" rel="noopener" class="reference-link">Open the OpenAPI contract <v-icon size="16">mdi-open-in-new</v-icon></a><a v-if="protocol === 'graphql'" href="/graphql" target="_blank" rel="noopener" class="reference-link">Open the GraphQL workspace <v-icon size="16">mdi-open-in-new</v-icon></a>
      </section>
    </div>
    <section class="connection-checks"><h3>When a request does not work</h3><dl><div><dt>401 · Authentication</dt><dd>Check API-key enablement, expiry, revocation, and the bearer header. For MCP, also check the resource binding.</dd></div><div><dt>403 · Authorization</dt><dd>Review the key’s permission group and page rules. MCP also requires use:mcp or manage:system. GraphQL may report permission errors inside an HTTP 200 response.</dd></div><div><dt>Browser sessions</dt><dd>The internal <code>/_api</code> routes belong to the application and reject API keys. Use the public REST, GraphQL or MCP contract for integrations.</dd></div></dl></section>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { apiAccessContract } from '../../../shared/api-access.ts'
import type { ApiConnectionInfo } from '../../../shared/api-admin.ts'
const { connections, loading, error, enabled } = defineProps<{ connections: ApiConnectionInfo | null; loading: boolean; error: boolean; enabled: boolean }>()
defineEmits<{ retry: []; create: [] }>()
const protocol = ref('rest')
const copied = ref('')
const protocolTitle = computed(() => ({ rest: 'REST v1', graphql: 'GraphQL', mcp: 'Model Context Protocol' })[protocol.value] || 'REST v1')
const endpoint = computed(() => protocol.value === 'mcp' ? connections?.mcpResource : `${window.location.origin}${protocol.value === 'graphql' ? apiAccessContract.graphqlPath : apiAccessContract.externalRestPrefix}`)
const openApiEndpoint = `${window.location.origin}${apiAccessContract.openApiPath}`
const example = computed(() => {
  if (protocol.value === 'mcp') return `Transport: Streamable HTTP\nURL: ${endpoint.value || '<canonical MCP resource>'}\nAuthorization: Bearer <API_KEY>`
  const auth = '  --header "Authorization: Bearer $WIKI_API_KEY"'
  if (protocol.value === 'rest') return `curl '${endpoint.value}/pages?limit=10' \\\n${auth}`
  return `curl '${endpoint.value}' \\\n${auth} \\\n  --header 'Content-Type: application/json' \\\n  --data '{"query":"query { pages { list(limit: 10) { id title path locale } } }"}'`
})
async function copy(value: string) { try { await navigator.clipboard.writeText(value); copied.value = 'Copied to clipboard.' } catch { copied.value = 'Copy failed. Select the text and copy it manually.' } }
</script>
<style scoped>
.connect-kicker { font-size: .7rem; letter-spacing: .09em; text-transform: uppercase; color: var(--wiki-accent-ink); }
h2 { font: 500 2rem var(--wiki-font-display); margin-block: .5rem 1rem; }h3 { font: 500 1.3rem var(--wiki-font-display); margin-block: .5rem 1rem; }p, dd { font-size: .85rem; line-height: 1.75; }.connect-heading { max-width: 75ch; margin-bottom: 1rem; }.connect-heading p { margin-bottom: 1rem; }
.connect-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.2fr); gap: 2rem; align-items: start; }.connect-panel { padding: 1.5rem; border: 1px solid var(--wiki-surface-border); border-radius: var(--wiki-panel-radius); background: var(--wiki-surface-raised); }.connect-panel p { margin-block: 1rem; }.connect-example { min-width: 0; padding-block: .75rem; }.connect-example p { margin-bottom: 1rem; }
code { font: .8rem var(--wiki-font-mono); overflow-wrap: anywhere; }.endpoint-value { display: block; padding-block: .5rem; }.connection-facts { margin-block: 1.5rem; display: grid; gap: 1rem; }.connection-facts dt { font-size: .7rem; }.connection-facts dd { margin: .3rem 0 0; }.connection-note { font-size: .75rem; }.connection-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: .78rem/1.8 var(--wiki-font-mono); padding: 1.25rem; background: var(--wiki-surface-raised); border: 1px solid var(--wiki-surface-border); border-radius: var(--wiki-control-radius); margin-block: 1rem; }pre:focus-visible { outline: 2px solid var(--wiki-accent-ink); }.reference-link { display: inline-flex; align-items: center; gap: .5rem; margin-top: .75rem; font-size: .85rem; color: var(--wiki-accent-ink); }
.connection-checks { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--wiki-surface-border); }.connection-checks dl { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 2rem; }.connection-checks dt { font-size: .85rem; font-weight: 500; }.connection-checks dd { margin: .5rem 0 0; }
@media(max-width: 950px) { .connect-grid, .connection-checks dl { grid-template-columns: 1fr; gap: 1rem; } }
</style>
