<template lang='pug'>
  v-container.admin-api(fluid)
    v-row
      v-col(cols='12')
        admin-hero(
          :title='$t(`admin:api.title`)'
          description='Connect applications and external agents to your wiki with controlled access.'
          eyebrow='Intelligence & connections'
          icon='mdi-api'
        )
          template(v-slot:status)
            .admin-api-status.d-flex.align-center
              v-chip(v-if='loadState === `success`', label, size="small", :color='enabled ? `success` : `warning`')
                v-icon(start, size="small") {{ enabled ? 'mdi-check-circle' : 'mdi-api-off' }}
                span {{ enabled ? $t('admin:api.enabled') : $t('admin:api.disabled') }}
              v-chip(v-else-if='loadState === `error`', label, size="small", color='error')
                v-icon(start, size="small") mdi-alert
                span Unable to load status
          template(v-slot:actions)
            .admin-api-actions.d-flex.align-center.flex-wrap.ga-2
              v-btn(variant="outlined", color='grey', icon, @click='refresh', :loading='loadState === `loading`', :disabled='adminApiBusy', aria-label='Refresh API status')
                v-icon mdi-refresh
              v-btn(v-if='loadState === `success` && enabled', variant="outlined", color='error', @click='disableDialog = true', :loading='isToggleLoading', :disabled='adminApiBusy')
                v-icon(start) mdi-power
                span {{$t('admin:api.disableButton')}}
              v-btn(v-else-if='loadState === `success`', variant="outlined", color='success', @click='globalSwitch', :loading='isToggleLoading', :disabled='adminApiBusy')
                v-icon(start) mdi-power
                span {{$t('admin:api.enableButton')}}
              v-btn(color='primary', variant="flat", size="large", @click='newKey', :disabled='loadState !== `success` || adminApiBusy')
                v-icon(start) mdi-plus
                span {{$t('admin:api.newKeyButton')}}
        v-alert.mt-3(
          v-if='loadState === `success` && !enabled'
          type='warning'
          variant='tonal'
          icon='mdi-api-off'
        )
          | API-key requests are currently disabled. Existing keys remain stored and can be managed below.
        v-card.mt-3.animated.fadeInUp
          v-card-title.d-flex.align-center.flex-wrap.ga-2
            v-icon.mr-2(color='primary') mdi-key-chain
            h2.text-body-large.ma-0 API keys
            v-spacer
            v-chip(v-if='loadState === `success`', label, size="small", :color='activeKeyCount ? `success` : `info`') {{ activeKeyCount ? `${activeKeyCount} active` : 'No active keys' }}
          .admin-filter-bar.d-flex.align-center.flex-wrap(v-if='loadState === `success` && keys.length')
            v-text-field(v-model='keySearch' label='Find an API key' prepend-inner-icon='mdi-magnify' variant='outlined' density='compact' hide-details clearable)
            v-select(v-model='keyFilter' label='Key status' :items='keyFilterOptions' variant='outlined' density='compact' hide-details)
            span.admin-api__filter-count(role='status') {{ filteredKeys.length }} of {{ keys.length }} keys
          v-divider
          v-skeleton-loader(v-if='loadState === `loading`', type='table-tbody')
          v-alert.ma-4(v-else-if='loadState === `error`', type='error', variant="tonal", icon='mdi-alert')
            span Unable to load API keys.
            v-btn.ml-2(variant="text", size="small", @click='refresh') Retry
          template(v-else)
            .admin-api__empty(v-if='keys.length && !filteredKeys.length')
              v-icon(size='28') mdi-key-outline
              h3 {{ keyFilter === 'active' && !keySearch ? 'No active API keys' : 'No matching API keys' }}
              p {{ keyFilter === 'active' && !keySearch ? 'Create a key to connect an application, or review previously revoked keys.' : 'Try another name or change the status filter.' }}
              v-btn(variant='text' color='primary' @click='keySearch = ``; keyFilter = `all`') Show all keys
            v-table(v-if='$vuetify.display.lgAndUp && filteredKeys.length > 0')
              template(v-slot:default)
                caption.api-key-caption API keys and their current status
                thead
                  tr.bg-surface-variant
                    th(scope='col') {{$t('admin:api.headerName')}}
                    th(scope='col') {{$t('admin:api.headerKeyEnding')}}
                    th(scope='col') {{$t('admin:api.headerExpiration')}}
                    th(scope='col') {{$t('admin:api.headerCreated')}}
                    th(scope='col') {{$t('admin:api.headerLastUpdated')}}
                    th(scope='col', width='100') {{$t('admin:api.headerRevoke')}}
                tbody
                  tr(v-for='key of filteredKeys', :key='`key-` + key.id')
                    td
                      strong(:class='key.isRevoked ? `text-error` : ``') {{ key.name }}
                      em.text-body-small.ml-1.text-error(v-if='key.isRevoked') (revoked)
                    td.text-body-small {{ key.keyShort }}
                    td(:style='key.isRevoked ? `text-decoration: line-through;` : ``') {{ $helpers.formatMoment(key.expiration, 'LL') }}
                    td {{ $helpers.formatMoment(key.createdAt, 'calendar') }}
                    td {{ $helpers.formatMoment(key.updatedAt, 'calendar') }}
                    td
                      v-btn(icon, @click='revoke(key)', :disabled='key.isRevoked || adminApiBusy', :aria-label='`Revoke ${key.name}`')
                        v-icon(color='error') mdi-cancel
            div(v-else-if='filteredKeys.length > 0')
              .admin-mobile-record(v-for='key of filteredKeys', :key='`mobile-key-` + key.id')
                .d-flex.align-center
                  .admin-mobile-record-title(:class='key.isRevoked ? `text-error` : ``') {{ key.name }}
                  v-spacer
                  v-chip(label, size="x-small", :color='key.isRevoked ? `error` : `success`') {{ key.isRevoked ? 'Revoked' : 'Active' }}
                .admin-mobile-record-meta Key ending {{ key.keyShort }}
                .text-body-small.text-medium-emphasis.mt-2 Expires {{ $helpers.formatMoment(key.expiration, 'LL') }}
                .text-body-small.text-grey Created {{ $helpers.formatMoment(key.createdAt, 'calendar') }}
                .text-body-small.text-grey Updated {{ $helpers.formatMoment(key.updatedAt, 'calendar') }}
                v-btn.mt-2(v-if='!key.isRevoked', variant="outlined", size="small", color='error', @click='revoke(key)', :disabled='adminApiBusy', :aria-label='`Revoke ${key.name}`')
                  v-icon(start) mdi-cancel
                  span {{$t('admin:api.revoke')}}
            v-card-text(v-if='!keys.length')
              v-alert.mb-0(icon='mdi-information', :model-value='true', variant="outlined", color='info') {{$t('admin:api.noKeyInfo')}}
        v-card.mt-3.animated.fadeInUp
          v-card-title.d-flex.align-center.flex-wrap.ga-2
            v-icon.mr-2(color='primary') mdi-book-open-variant
            h2.text-body-large.ma-0 Integration reference
            v-spacer
            v-chip(label, size="small", color='success') Stable compatibility surface
          v-divider
          v-row.ma-0
            v-col(cols='12', lg='7')
              v-card-text
                p tsEpistle supports API-key integrations through GraphQL and the versioned REST v1 API.
                .text-label-small GraphQL endpoint
                code.api-contract-code {{ graphqlEndpoint }}
                .text-label-small.mt-4 Authentication
                p Send the generated key as an HTTP bearer token:
                code.api-contract-code Authorization: {{ apiAccessContract.bearerScheme }} &lt;API_KEY&gt;
                .text-label-small.mt-4 Full-access key example
                pre.api-contract-example(tabindex='0' role='region' aria-label='GraphQL request example') {{ curlExample }}
                .text-label-small.mt-4 REST v1 endpoint
                code.api-contract-code {{ externalRestEndpoint }}
                .text-label-small.mt-4 OpenAPI 3.1 contract
                code.api-contract-code {{ openApiEndpoint }}
            v-col(cols='12', lg='5')
              v-card-text
                .text-label-small MCP · External agents
                code.api-contract-code {{ mcpEndpoint }}
                p.mt-4 Connect an MCP client using Streamable HTTP. MCP must be enabled in the deployment and requires a resource-bound API key for this exact endpoint.
                p Ordinary browser sessions do not authenticate MCP requests. Key permissions and page access rules still apply.
                v-btn(v-if='canManageAgents' to='/agents' variant='tonal' color='primary' prepend-icon='mdi-robot-outline') Agent runtime settings
                v-divider.my-4
                .text-label-small Internal REST transport
                code.api-contract-code {{ internalRestEndpoint }}
                p.mt-4 The REST routes under this prefix are application-internal and are not a public integration contract. API keys are rejected; signed-in user sessions are required.
                v-divider.my-4
                .text-label-small Permission scopes
                p.mb-2 #[strong Full access] uses the system-administrator permissions.
                p.mb-0 #[strong Group scoped] uses the selected group's permissions. GraphQL directives and REST handlers enforce every operation's required permissions and page rules.

    create-api-key(v-model='isCreateDialogShown', :refresh-api-keys='refresh')

    v-dialog(v-model='isRevokeConfirmDialogShown', max-width='500', persistent, aria-labelledby='revoke-api-key-dialog-title')
      v-card
        .dialog-header.is-red
          span#revoke-api-key-dialog-title {{$t('admin:api.revokeConfirm')}}
        v-card-text.pa-4
          i18next(tag='span', path='admin:api.revokeConfirmText')
            strong(place='name') {{ current ? current.name : '' }}
        v-card-actions
          v-spacer
          v-btn(variant="text", @click='isRevokeConfirmDialogShown = false', :disabled='revokeLoading') {{$t('common:actions.cancel')}}
          v-btn(color='red', @click='revokeConfirm', :loading='revokeLoading', :disabled='revokeLoading') {{$t('admin:api.revoke')}}
    v-dialog(v-model='disableDialog', max-width='500', persistent, aria-labelledby='disable-api-access-dialog-title')
      v-card
        .dialog-header.is-red
          span#disable-api-access-dialog-title Disable API-key access?
        v-card-text.pa-4 Existing API keys remain stored, but all API-key requests will stop until access is enabled again. Continue?
        v-card-actions
          v-spacer
          v-btn(variant="text", @click='disableDialog = false', :disabled='isToggleLoading') {{$t('common:actions.cancel')}}
          v-btn(color='error', @click='disableApi', :loading='isToggleLoading', :disabled='isToggleLoading') Disable API access
</template>

<script lang='ts'>
import { markRaw } from 'vue'
import { wikiStore } from '@/store/index.ts'

import CreateApiKey from './admin-api-create.vue'
import { fetchAdminApiBootstrap, revokeAdminApiKey, setAdminApiState, type AdminApiKey } from '../../helpers/auth-api'
import { getErrorMessage } from '../../helpers/root-ui-store'
import { apiAccessContract } from '../../../shared/api-access.ts'

export default {
  components: {
    CreateApiKey
  },
  data() {
    return {
      enabled: false,
      isToggleLoading: false,
      keys: [] as AdminApiKey[],
      keySearch: '',
      keyFilter: 'active',
      loadState: 'loading' as 'loading' | 'success' | 'error',
      isCreateDialogShown: false,
      isRevokeConfirmDialogShown: false,
      disableDialog: false,
      revokeLoading: false,
      current: null as AdminApiKey | null,
      isDisposed: false
    }
  },
  computed: {
    keyFilterOptions() {
      return [{ title: `Active (${this.activeKeyCount})`, value: 'active' }, { title: `Revoked (${this.keys.length - this.activeKeyCount})`, value: 'revoked' }, { title: `All keys (${this.keys.length})`, value: 'all' }]
    },
    filteredKeys(): AdminApiKey[] {
      const query = (this.keySearch || '').trim().toLocaleLowerCase()
      return this.keys.filter(key => (!query || key.name.toLocaleLowerCase().includes(query)) && (this.keyFilter === 'all' || (this.keyFilter === 'revoked' ? key.isRevoked : !key.isRevoked)))
    },
    adminApiBusy(): boolean {
      return this.loadState === 'loading' || this.isToggleLoading || this.revokeLoading
    },
    activeKeyCount(): number {
      return this.keys.reduce((count, key) => count + (key.isRevoked ? 0 : 1), 0)
    },
    apiAccessContract() {
      return apiAccessContract
    },
    canManageAgents() { return wikiStore.user.permissions.includes('manage:system') },
    mcpEndpoint() { return `${window.location.origin}${apiAccessContract.mcpPath}` },
    graphqlEndpoint() {
      return `${window.location.origin}${apiAccessContract.graphqlPath}`
    },
    externalRestEndpoint() {
      return `${window.location.origin}${apiAccessContract.externalRestPrefix}`
    },
    openApiEndpoint() {
      return `${window.location.origin}${apiAccessContract.openApiPath}`
    },
    internalRestEndpoint() {
      return `${window.location.origin}${apiAccessContract.internalRestPrefix}/*`
    },
    curlExample() {
      return [
        `curl --request POST '${this.graphqlEndpoint}' \\`,
        `  --header 'Authorization: ${apiAccessContract.bearerScheme} <API_KEY>' \\`,
        "  --header 'Content-Type: application/json' \\",
        "  --data '{\"query\":\"query { system { info { currentVersion product { name version } } } }\"}'"
      ].join('\n')
    }
  },
  methods: {
    async loadApiBootstrap () {
      if (this.isDisposed) return false
      this.loadState = 'loading'
      wikiStore.startLoading('admin-api-state-refresh')
      wikiStore.startLoading('admin-api-keys-refresh')
      try {
        const bootstrap = await fetchAdminApiBootstrap(window.fetch.bind(window), 'Admin API bootstrap response is invalid')
        if (this.isDisposed) return false
        this.enabled = bootstrap.enabled
        this.keys = markRaw(bootstrap.keys)
        this.loadState = 'success'
        return true
      } catch (err) {
        if (this.isDisposed) return false
        this.loadState = 'error'
        wikiStore.showNotification({
          style: 'red',
          message: getErrorMessage(err),
          icon: 'alert'
        })
        return false
      } finally {
        wikiStore.stopLoading('admin-api-state-refresh')
        wikiStore.stopLoading('admin-api-keys-refresh')
      }
    },
    async refresh (notify = true) {
      if (this.isDisposed || this.loadState === 'loading') return false
      const loaded = await this.loadApiBootstrap()
      if (notify && loaded) {
        wikiStore.showNotification({
          message: this.$t('admin:api.refreshSuccess'),
          style: 'success',
          icon: 'cached'
        })
      }
      return loaded
    },
    async globalSwitch () {
      if (this.isDisposed || this.isToggleLoading || this.revokeLoading || this.loadState !== 'success') return
      const wasEnabled = this.enabled
      this.isToggleLoading = true
      wikiStore.startLoading('admin-api-toggle')
      try {
        await setAdminApiState(window.fetch.bind(window), !this.enabled)
        if (this.isDisposed) return
        const loaded = await this.refresh(false)
        if (loaded) {
          wikiStore.showNotification({
            style: 'success',
            message: wasEnabled ? this.$t('admin:api.toggleStateDisabledSuccess') : this.$t('admin:api.toggleStateEnabledSuccess'),
            icon: 'check'
          })
        }
      } catch (err) {
        if (!this.isDisposed) wikiStore.showError(err)
      } finally {
        wikiStore.stopLoading('admin-api-toggle')
        if (!this.isDisposed) this.isToggleLoading = false
      }
    },
    async disableApi () {
      this.disableDialog = false
      await this.globalSwitch()
    },
    newKey () {
      if (this.isDisposed || this.adminApiBusy) return
      this.isCreateDialogShown = true
    },
    revoke (key: AdminApiKey) {
      if (this.isDisposed || this.adminApiBusy || key.isRevoked) return
      this.current = key
      this.isRevokeConfirmDialogShown = true
    },
    async revokeConfirm () {
      if (this.isDisposed || this.revokeLoading || !this.current) return
      this.revokeLoading = true
      wikiStore.startLoading('admin-api-revoke')
      try {
        await revokeAdminApiKey(window.fetch.bind(window), this.current.id)
        if (this.isDisposed) return
        const loaded = await this.refresh(false)
        if (loaded) {
          wikiStore.showNotification({
            style: 'success',
            message: this.$t('admin:api.revokeSuccess'),
            icon: 'check'
          })
        }
      } catch (err) {
        if (!this.isDisposed) wikiStore.showError(err)
      } finally {
        wikiStore.stopLoading('admin-api-revoke')
        if (!this.isDisposed) {
          this.isRevokeConfirmDialogShown = false
          this.revokeLoading = false
        }
      }
    }
  },
  created () {
    this.loadApiBootstrap()
  },
  beforeUnmount () {
    this.isDisposed = true
  }
}
</script>

<style lang='scss'>
.admin-api .admin-mobile-record {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--wiki-surface-border);
  &-title { font-size: .9rem; font-weight: 600; overflow-wrap: anywhere; }
  &-meta { margin-top: .5rem; font-size: .8rem; overflow-wrap: anywhere; color: var(--admin-muted); }
}
.admin-api__filter-count { color: var(--admin-muted); font-size: .75rem; padding: .5rem; }
.admin-api__empty { display: grid; justify-items: center; gap: .6rem; padding: 2rem 1.25rem; text-align: center; color: var(--admin-muted); h3 { font-size: 1rem; color: rgb(var(--v-theme-on-surface)); } p { margin: 0; max-width: 50ch; font-size: .85rem; } }

.api-contract-code {
  display: block;
  overflow-wrap: anywhere;
}

.api-key-caption {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.api-contract-example {
  margin: 0;
  overflow-x: auto;
  padding: 1rem;
  white-space: pre;
}

@media (max-width: 959px) {

  .admin-api-status,
  .admin-api-actions {
    flex-basis: 100%;
  }

  .admin-api-actions .v-btn:last-child {
    flex: 1;
  }
}
</style>
