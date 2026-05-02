<template>
  <div class="website-export-view" ref="rootRef">

    <div class="export-main">
      <div class="view-header">
        <h2>{{ $t('htmlSite.title') }}</h2>
        <span class="header-hint">{{ $t('htmlSite.desc') }}</span>
      </div>
      <div class="export-content">
        <WebsitePreview
          :snapshot="snapshot"
          :loading="snapshotLoading"
          :error="snapshotError"
          :iframe-key="iframeKey"
          :iframe-url="iframeUrl"
        />
      </div>
    </div>

    <!-- Reopen panel button when panel is closed -->
    <button v-if="!panelOpen" class="panel-open-btn" :aria-label="$t('panel.open') ?? 'Open'" @click="openPanel">◀</button>

    <template v-if="panelOpen">
      <div class="panel-drag-handle" @mousedown="(e: MouseEvent) => startResize(e, rootRef!)"></div>
      <div class="export-panel" :style="{ width: panelWidth + 'px' }">
        <WebsitePanel
          v-model:focusPersonId="focusPersonId"
          v-model:scopeMode="scopeMode"
          v-model:ancestors="ancestors"
          v-model:descendants="descendants"
          v-model:excludeLiving="excludeLiving"
          v-model:redactLiving="redactLiving"
          v-model:mediaPersonOnly="mediaPersonOnly"
          v-model:includeMedia="includeMedia"
          v-model:siteTitle="siteTitle"
          :exporting="exporting"
          :last-output="lastOutput"
          :bundle-missing="bundleMissing"
          @export="exportSite"
          @close="closePanel"
        />
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import WebsitePanel from '../components/WebsitePanel.vue';
import WebsitePreview, { type PreviewSnapshot } from '../components/WebsitePreview.vue';
import { usePanelResize } from '../composables/usePanelResize';
import { STORAGE_KEYS } from '../utils/storage-keys';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const focusPersonId = ref<string | null>(null);
const scopeMode = ref<'focus' | 'everyone'>('focus');
const ancestors = ref(5);
const descendants = ref(3);
const excludeLiving = ref(false);
const redactLiving = ref(true);
const mediaPersonOnly = ref(true);
const includeMedia = ref(true);
const siteTitle = ref('Family Tree');
const exporting = ref(false);
const lastOutput = ref<string | null>(null);
const bundleMissing = ref(false);

const snapshot = ref<PreviewSnapshot | null>(null);
const snapshotLoading = ref(false);
const snapshotError = ref<string | null>(null);
const iframeKey = ref(0);
const iframeUrl = ref<string | null>(null);

function setIframeUrl(html: string): void {
  // Revoke previous Blob URL so the renderer doesn't leak memory across
  // refreshes (each preview is ~1.5 MB).
  if (iframeUrl.value) URL.revokeObjectURL(iframeUrl.value);
  const blob = new Blob([html], { type: 'text/html' });
  iframeUrl.value = URL.createObjectURL(blob);
}

onBeforeUnmount(() => {
  if (iframeUrl.value) URL.revokeObjectURL(iframeUrl.value);
});

const rootRef = ref<HTMLElement | null>(null);
const { panelWidth, startResize } = usePanelResize({
  storageKey: STORAGE_KEYS.websitePanelWidth,
  defaultWidth: 280,
  minWidth: 220,
});

const panelOpen = ref(localStorage.getItem(STORAGE_KEYS.websitePanelOpen) !== 'false');
function openPanel() {
  panelOpen.value = true;
  localStorage.setItem(STORAGE_KEYS.websitePanelOpen, 'true');
}
function closePanel() {
  panelOpen.value = false;
  localStorage.setItem(STORAGE_KEYS.websitePanelOpen, 'false');
}

const canPreview = computed(() => scopeMode.value === 'everyone' || !!focusPersonId.value);

let pendingToken = 0;

async function refreshPreview() {
  if (!canPreview.value) {
    snapshot.value = null;
    snapshotLoading.value = false;
    snapshotError.value = null;
    return;
  }
  const previewFn = window.api.website?.previewSnapshot;
  const buildHtmlFn = window.api.website?.buildPreviewHtml;
  if (typeof previewFn !== 'function' || typeof buildHtmlFn !== 'function') {
    snapshot.value = null;
    snapshotLoading.value = false;
    snapshotError.value = 'Website preview IPC channels are missing — restart the app to pick up the new preload.';
    return;
  }
  const token = ++pendingToken;
  snapshotLoading.value = true;
  snapshotError.value = null;
  const scope = scopeMode.value === 'everyone'
    ? { everyone: true }
    : { focusId: focusPersonId.value, ancestors: ancestors.value, descendants: descendants.value };
  try {
    // Two parallel calls: lightweight stats for the pills, plus the full
    // SPA HTML (with snapshot inlined) for the iframe srcdoc.
    const [statsResult, htmlResult] = await Promise.all([
      previewFn({
        siteTitle: siteTitle.value,
        scope,
        options: { excludeLiving: excludeLiving.value, redactLiving: redactLiving.value },
      }),
      buildHtmlFn({
        siteTitle: siteTitle.value,
        focusPersonId: focusPersonId.value,
        scope,
        options: {
          excludeLiving: excludeLiving.value,
          redactLiving: redactLiving.value,
          mediaPersonOnly: mediaPersonOnly.value,
        },
      }),
    ]);
    if (token !== pendingToken) return;
    snapshot.value = statsResult as PreviewSnapshot;
    setIframeUrl(htmlResult as string);
    iframeKey.value++;
  } catch (e) {
    console.error('Preview snapshot failed', e);
    if (token === pendingToken) {
      snapshot.value = null;
      snapshotError.value = e instanceof Error ? e.message : String(e);
    }
  } finally {
    if (token === pendingToken) snapshotLoading.value = false;
  }
}

// Auto-refresh whenever a preview-affecting field changes. Debounced so
// rapid changes (e.g. dragging a number input) coalesce into one worker
// call. Preview is now ~15ms even on "everyone" scope after the bulk
// living-derivation refactor, so auto-refresh no longer saturates the worker.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  [focusPersonId, scopeMode, ancestors, descendants, excludeLiving, redactLiving, siteTitle],
  () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { refreshPreview(); }, 250);
  },
);

// Default the subject to the database's tree subject and kick off the first
// preview as soon as we have a focus.
onMounted(async () => {
  if (!focusPersonId.value) {
    try {
      const id = await window.api.db.getSetting('default_person_id') as string | null;
      if (id) focusPersonId.value = id;
    } catch (e) {
      console.error('Failed to load default person', e);
    }
  }
  if (canPreview.value) refreshPreview();
});

async function exportSite() {
  exporting.value = true;
  lastOutput.value = null;
  bundleMissing.value = false;
  try {
    const res = await window.api.website.export({
      siteTitle: siteTitle.value,
      focusPersonId: focusPersonId.value,
      scope: scopeMode.value === 'everyone'
        ? { everyone: true }
        : { focusId: focusPersonId.value, ancestors: ancestors.value, descendants: descendants.value },
      options: {
        includeMedia: includeMedia.value,
        excludeLiving: excludeLiving.value,
        redactLiving: redactLiving.value,
        mediaPersonOnly: mediaPersonOnly.value,
      },
    }) as { canceled?: boolean; outputDir?: string; bundleMissing?: boolean } | null;
    if (res?.bundleMissing) {
      bundleMissing.value = true;
    } else if (res && !res.canceled && res.outputDir) {
      lastOutput.value = res.outputDir;
    }
  } catch (e) {
    console.error('Export failed', e);
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.website-export-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  gap: var(--space-xs);
  position: relative;
}
.panel-open-btn {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-right: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
}
.panel-open-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }
.export-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.view-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-lg) var(--space-sm);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
}
.view-header h2 { margin: 0; }
.header-hint {
  font-size: var(--font-sm);
  color: var(--text-muted);
}
.export-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-lg);
  overflow: hidden;
}
.panel-drag-handle {
  width: 6px;
  background: var(--surface-border-subtle);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.1s;
}
.panel-drag-handle:hover { background: var(--surface-border); }
.export-panel {
  flex-shrink: 0;
  height: 100%;
}
</style>
