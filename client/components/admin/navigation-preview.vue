<template>
  <div class="navigation-specimen" aria-label="Menu preview">
    <div class="navigation-specimen-brand">
      <v-icon icon="mdi-compass-outline" size="20" /><strong
        >Your workspace</strong
      >
    </div>
    <div v-if="mode === 'NONE'" class="navigation-specimen-empty">
      <v-icon icon="mdi-dock-left" size="28" /><strong>Sidebar hidden</strong>
      <p>
        Readers can still use the page header and search. Your custom links are
        retained.
      </p>
    </div>
    <template v-else>
      <div class="navigation-specimen-switch">
        <span v-if="mode !== 'TREE'"
          ><v-icon icon="mdi-home-outline" size="18" /> Home</span
        ><strong v-if="mode !== 'STATIC'">{{
          mode === "TREE" ? "Browse" : "Main menu"
        }}</strong
        ><span v-if="mode === 'MIXED'">Browse</span>
      </div>
      <div v-if="mode === 'TREE'" class="navigation-specimen-empty">
        <v-icon icon="mdi-file-tree-outline" size="28" /><strong
          >Page directory</strong
        >
        <p>
          Browse follows the workspace page hierarchy. Page permissions determine which destinations a reader can open.
        </p>
      </div>
      <template v-else
        ><div class="navigation-specimen-items">
          <template v-for="item in visible" :key="item.id"
            ><div v-if="item.kind === 'link'" class="navigation-specimen-link">
              <v-icon
                :icon="item.icon || 'mdi-link-variant'"
                size="18"
              /><span>{{ item.label }}</span
              ><v-icon
                v-if="item.targetType === 'externalblank'"
                icon="mdi-arrow-top-right"
                size="14"
              />
            </div>
            <h4 v-else-if="item.kind === 'header'">{{ item.label }}</h4>
            <hr v-else
          /></template>
        </div>
        <p v-if="!visible.length" class="navigation-specimen-empty">
          No custom links are visible to this audience.
        </p></template
      >
    </template>
    <div class="navigation-specimen-caption">
      {{ locale }} · Illustrative sidebar
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import {
  navigationMenuItems,
  type NavigationItem,
  type NavigationPolicy,
} from "../../../shared/navigation-policy.ts";
const props = defineProps<{
  items: NavigationItem[];
  groups: number[];
  mode: NavigationPolicy["mode"];
  locale: string;
}>();
const visible = computed(() => navigationMenuItems(props.items, props.groups));
</script>
