<template>
  <div class="agent-context" aria-label="Sources and search scope">
    <div class="agent-context__scope">
      <v-menu content-class="agent-owned-overlay" location="top start">
        <template #activator="{ props: menuProps }"><v-btn v-bind="menuProps" variant="text" size="small" prepend-icon="mdi-text-search" append-icon="mdi-chevron-down" aria-label="Choose Agent search scope">{{ scopeLabel }}</v-btn></template>
        <v-list density="compact" aria-label="Agent search scope">
          <v-list-item title="All Wiki" subtitle="Search every page you can access" prepend-icon="mdi-earth" :active="draft.scope.kind === 'all'" @click="setScope({ kind: 'all' })" />
          <v-list-item v-if="currentPage" title="This page tree" :subtitle="currentPage.path" prepend-icon="mdi-file-tree-outline" :active="draft.scope.kind === 'section'" @click="setScope({ kind: 'section', locale: currentPage.locale, path: currentPage.path })" />
          <v-list-item title="Selected pages" subtitle="Search within the sources attached here" prepend-icon="mdi-file-multiple-outline" :disabled="!draft.sources.length" :active="draft.scope.kind === 'selected'" @click="setScope({ kind: 'selected' })" />
        </v-list>
      </v-menu>
      <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="emit('findSources')">Add sources</v-btn>
    </div>
    <div v-if="currentPage || draft.sources.length" class="agent-context__sources" aria-label="Pages attached to the next message">
      <v-chip v-if="currentPage && draft.includeCurrentPage" closable :close-label="`Remove current page ${currentPage.path}`" size="small" variant="tonal" prepend-icon="mdi-file-link-outline" @click:close="emit('change', { includeCurrentPage: false })"><span class="agent-context__source-label">Current page · {{ currentPage.locale }}/{{ currentPage.path }}</span></v-chip>
      <v-btn v-else-if="currentPage" size="small" variant="text" prepend-icon="mdi-file-link-outline" @click="emit('change', { includeCurrentPage: true })">Include current page</v-btn>
      <v-chip v-for="source in draft.sources" :key="source.id" size="small" closable :close-label="`Remove source ${source.title}`" :aria-label="`Preview attached source ${source.title}`" variant="outlined" prepend-icon="mdi-file-document-outline" @click="previewSelector = { id: source.id }" @click:close="removeSource(source.id)"><span class="agent-context__source-label">{{ source.title }}</span></v-chip>
    </div>
    <p v-if="draft.sources.length === 8" class="agent-context__limit" role="status">Eight sources attached. Remove one to add another.</p>
    <WikiSourcePreview v-if="previewSelector" :selector="previewSelector" @close="previewSelector = null" />
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AgentDraft, AgentSearchScope } from '../../helpers/agent-draft.ts'
import type { AgentCurrentPageHint } from '../../../shared/agents/contracts.ts'
import type { WikiSourceSelector } from '../../../shared/wiki-source.ts'
import WikiSourcePreview from '../common/wiki-source-preview.vue'
const props = defineProps<{ draft: AgentDraft; currentPage: AgentCurrentPageHint | null }>()
const emit = defineEmits<{ change: [patch: Partial<AgentDraft>]; findSources: [] }>()
const previewSelector = ref<WikiSourceSelector | null>(null)
const scopeLabel = computed(() => props.draft.scope.kind === 'selected' ? 'Selected pages' : props.draft.scope.kind === 'section' ? `Within ${props.draft.scope.path}` : props.draft.scope.kind === 'locale' ? `${props.draft.scope.locale.toUpperCase()} pages` : 'All Wiki')
const setScope = (scope: AgentSearchScope): void => emit('change', { scope })
const removeSource = (id: number): void => {
  const sources = props.draft.sources.filter(source => source.id !== id)
  emit('change', { sources, ...(props.draft.scope.kind === 'selected' && !sources.length ? { scope: { kind: 'all' } } : {}) })
}
</script>
<style scoped>
.agent-context { padding: .2rem 0 .65rem; min-width: 0; }
.agent-context__scope { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .25rem; }
.agent-context__scope :deep(.v-btn__content) { max-width: min(28rem, 65vw); overflow: hidden; text-overflow: ellipsis; }
.agent-context__sources { max-height: 8rem; overflow-y: auto; display: flex; flex-wrap: wrap; align-items: center; gap: .45rem; margin-top: .4rem; }
.agent-context__sources .v-chip { max-width: 100%; }
.agent-context__source-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-context__limit { font-size: .72rem; opacity: .7; margin: .4rem 0 0; }
</style>
