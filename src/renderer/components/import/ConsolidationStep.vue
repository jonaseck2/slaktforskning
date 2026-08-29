<template>
  <div class="consolidate">
    <h4 class="consolidate-title">{{ $t('importExport.consolidateTitle') }}</h4>

    <p v-if="visible.length === 0" class="consolidate-empty">
      {{ $t('importExport.consolidateNothing') }}
    </p>

    <template v-else>
      <p class="consolidate-intro">{{ $t('importExport.consolidateIntro') }}</p>

      <!-- ONE control for every exact cluster. 1496 volumes is 1496 rows and
           must not be 1496 clicks. -->
      <button
        v-if="exactCount > 0"
        class="approve-all-exact"
        type="button"
        @click="approveAllExact"
      >
        {{ $t('importExport.consolidateApproveAllExact', { count: exactCount }) }}
      </button>

      <ul class="cluster-list">
        <li v-for="c in visible" :key="clusterKey(c)" class="cluster-row">
          <label class="cluster-pick">
            <input
              type="checkbox"
              :checked="picked.has(clusterKey(c))"
              @change="togglePick(c)"
            />
            <span class="cluster-kind">
              {{ c.kind === 'exact' ? $t('importExport.consolidateExact') : $t('importExport.consolidateFuzzy') }}
            </span>
          </label>
          <span class="cluster-count">{{ $t('importExport.consolidateMembers', { count: c.memberIds.length }) }}</span>
          <span class="cluster-reason">{{ c.reason }}</span>
          <span class="cluster-actions">
            <button class="cluster-approve" type="button" @click="approveOne(c)">
              {{ $t('importExport.consolidateApprove') }}
            </button>
            <button class="cluster-decline" type="button" @click="declineOne(c)">
              {{ $t('importExport.consolidateDecline') }}
            </button>
          </span>
        </li>
      </ul>
    </template>

    <button class="consolidate-close" type="button" @click="$emit('close')">
      {{ $t('importExport.consolidateClose') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { DuplicateCluster } from '../../../api/duplicates/clusters';

/**
 * The review surface for what arrived more than once.
 *
 * One row per cluster, never per pair: 129 copies of one volume is 8256 pairs
 * from one title, and no researcher works through 8256 rows.
 *
 * This component decides nothing. It emits; the parent calls applyCluster /
 * declineCluster. Nothing merges without an explicit approval — the product
 * principle is "the user does the work; tools surface possibilities, never
 * commit".
 */

const props = defineProps<{ clusters: DuplicateCluster[] }>();
const emit = defineEmits<{
  approve: [cluster: DuplicateCluster];
  decline: [cluster: DuplicateCluster];
  approveAllExact: [];
  close: [];
}>();

/** Stable identity for a cluster — the representative plus what grouped it. */
const clusterKey = (c: DuplicateCluster): string =>
  `${c.entityType}:${c.kind}:${c.representativeId}:${c.reason}`;

/** Rows the user has already decided on, so the same question is not asked twice. */
const settled = ref(new Set<string>());
/** Ticked rows. Exact clusters start ticked; fuzzy ones need a human to look. */
const picked = ref(new Set<string>());

function resetFromProps(clusters: DuplicateCluster[]): void {
  settled.value = new Set<string>();
  picked.value = new Set(
    clusters.filter(c => c.kind === 'exact').map(clusterKey),
  );
}
resetFromProps(props.clusters);
watch(() => props.clusters, resetFromProps);

const visible = computed(() => props.clusters.filter(c => !settled.value.has(clusterKey(c))));
const exactCount = computed(() => visible.value.filter(c => c.kind === 'exact').length);

function togglePick(c: DuplicateCluster): void {
  const key = clusterKey(c);
  const next = new Set(picked.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  picked.value = next;
}

function settle(c: DuplicateCluster): void {
  const next = new Set(settled.value);
  next.add(clusterKey(c));
  settled.value = next;
}

function approveOne(c: DuplicateCluster): void {
  settle(c);
  emit('approve', c);
}

function declineOne(c: DuplicateCluster): void {
  settle(c);
  emit('decline', c);
}

function approveAllExact(): void {
  const next = new Set(settled.value);
  for (const c of visible.value) {
    if (c.kind === 'exact') next.add(clusterKey(c));
  }
  settled.value = next;
  emit('approveAllExact');
}
</script>

<style scoped>
.consolidate-title {
  font-size: var(--font-md);
  margin-bottom: 4px;
}
.consolidate-intro,
.consolidate-empty {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  margin-bottom: 8px;
}
.approve-all-exact {
  margin-bottom: 8px;
}
.cluster-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  max-height: 40vh;
  overflow-y: auto;
}
.cluster-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border-subtle, currentColor);
  font-size: var(--font-sm);
}
.cluster-pick {
  display: flex;
  align-items: center;
  gap: 4px;
}
.cluster-reason {
  color: var(--color-text-muted);
  flex: 1;
  overflow-wrap: anywhere;
}
.cluster-actions {
  display: flex;
  gap: 4px;
}
</style>
