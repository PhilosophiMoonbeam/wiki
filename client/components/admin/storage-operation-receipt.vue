<template>
  <article class="storage-receipt">
    <div class="storage-section-head"><span class="storage-kicker">Operation receipt</span><v-btn
        variant="text"
        size="small"
        prepend-icon="mdi-download"
        @click="emit('download')"
      >Download receipt</v-btn></div>
    <h3>{{ operation.title }}</h3>
    <p>{{ operation.effect }}</p>
    <dl class="storage-facts">
      <dt>Outcome</dt>
      <dd>{{ operationLabel(operation.state) }}</dd>
      <dt>Requested by</dt>
      <dd>{{ actor(operation.actorId) }}</dd>
      <dt>Reason</dt>
      <dd>{{ operation.reason }}</dd>
      <dt>Queued</dt>
      <dd>{{ dateTime(operation.createdAt) }}</dd>
      <dt>Started</dt>
      <dd>{{ dateTime(operation.startedAt) }}</dd>
      <dt>Finished</dt>
      <dd>{{ dateTime(operation.completedAt) }}</dd>
      <dt>Configuration revision</dt>
      <dd class="storage-mono">{{ operation.configurationRevision || 'Initial configuration' }}</dd>
    </dl>
    <v-alert
      v-if="operation.state === 'interrupted'"
      variant="tonal"
      type="warning"
      class="my-5"
    >The worker no longer has a current lease or its completion was not recorded. Some effects may already have occurred. Verify the destination
      and confirm the prior worker has stopped before resolving this record.</v-alert>
    <p
      v-if="operation.result"
      class="storage-result-message"
    >{{ operation.result.message }}</p>
    <div
      v-if="operation.result?.counts"
      class="storage-result-counts"
    ><span><strong>{{ operation.result.counts.total }}</strong> reported
        items</span><span><strong>{{ operation.result.counts.succeeded }}</strong>
        succeeded</span><span><strong>{{ operation.result.counts.failed }}</strong> failed or conflicted</span></div>
    <p
      v-else-if="operation.result && operation.handler !== 'activate'"
      class="storage-note"
    >This operation did not report item totals. A completed receipt does not establish how many files exist at the destination.</p>
    <div
      v-if="operation.result?.counts"
      class="storage-formats"
    ><span
        v-for="(count,format) in operation.result.counts.formats"
        :key="format"
      >{{ formatLabel(format) }} <strong>{{ count }}</strong></span></div>
    <ul
      v-if="operation.result?.targets.length"
      class="storage-applied-targets"
    >
      <li
        v-for="target in operation.result.targets"
        :key="target.key"
      ><strong>{{ targetTitle(target.key) }}</strong><span>{{ target.paused ? 'Paused offline' : target.active ? 'Initialized' : 'Initialization failed' }}</span>
      </li>
    </ul>
    <details
      v-for="(item,index) in operation.result?.items || []"
      :key="index"
      class="storage-item-result"
    >
      <summary><span>{{ item.path || 'Unnamed item' }}</span><span>{{ item.outcome }}</span></summary>
      <p>{{ item.kind }} · {{ item.format ? formatLabel(item.format) : 'No document format' }}</p>
      <p v-if="item.message">{{ item.message }}</p>
      <ul v-if="item.diagnostics.length">
        <li
          v-for="(diagnostic,n) in item.diagnostics"
          :key="n"
        >{{ diagnostic }}</li>
      </ul>
    </details>
    <p
      v-if="operation.result?.counts && operation.result.counts.total > operation.result.items.length"
      class="storage-note"
    >The receipt retains the first {{ operation.result.items.length }} item details; totals cover all reported items.</p>
    <div
      v-if="operation.resolution"
      class="storage-resolution"
    >
      <h4>{{ operation.state === 'cancelled' ? 'Cancellation' : 'Recovery decision' }}</h4>
      <p>{{ operation.resolution.reason }}</p><small>{{ actor(operation.resolution.actorId) }} ·
        {{ dateTime(operation.resolution.createdAt) }}</small>
    </div>
    <div class="storage-receipt-actions"><v-btn
        v-if="operation.canCancel"
        variant="outlined"
        :disabled="locked"
        @click="emit('decision',{operation,kind:'cancel'})"
      >Cancel before execution</v-btn><v-btn
        v-if="operation.canResolve"
        variant="outlined"
        :disabled="locked"
        @click="emit('decision',{operation,kind:'resolve'})"
      >Review recovery decision</v-btn>
      <p
        v-if="operation.state === 'running'"
        class="storage-note"
      >Running provider work cannot be forcibly cancelled from this page.</p>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { StorageOperationView } from '../../../shared/storage-workspace.ts'
import { dateTime, actor, formatLabel, operationLabel } from '../../helpers/storage-presentation.ts'
const { operation, targetTitles, locked } = defineProps<{ operation: StorageOperationView; targetTitles: Record<string, string>; locked: boolean }>()
const emit = defineEmits<{ download: []; decision: [value: { operation: StorageOperationView; kind: 'cancel' | 'resolve' }] }>()
const targetTitle = (key: string) => targetTitles[key] || key
</script>
