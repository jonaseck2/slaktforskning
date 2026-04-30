<template>
  <div v-if="enabled && hasContent" class="report-header-footer">
    <header class="rhf-header">
      <span class="rhf-app">{{ appName }}</span>
      <span v-if="researcherName" class="rhf-name">{{ researcherName }}</span>
    </header>
    <footer class="rhf-footer">
      <span v-if="researcherEmail" class="rhf-email">{{ researcherEmail }}</span>
      <span v-if="researcherPhone" class="rhf-phone">{{ researcherPhone }}</span>
      <span v-if="researcherAddress" class="rhf-address">{{ researcherAddress }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const props = defineProps<{
  /** Optional: if false, the header/footer is suppressed entirely. Default true. */
  enabled?: boolean;
}>();

const enabled = computed(() => props.enabled !== false);
const appName = 'Släktforskning';

const researcherName = ref<string | null>(null);
const researcherAddress = ref<string | null>(null);
const researcherPhone = ref<string | null>(null);
const researcherEmail = ref<string | null>(null);

const hasContent = computed(() =>
  !!(researcherName.value || researcherAddress.value || researcherPhone.value || researcherEmail.value),
);

onMounted(async () => {
  try {
    const [name, address, phone, email] = await Promise.all([
      window.api.db.getSetting('researcher_name') as Promise<string | null>,
      window.api.db.getSetting('researcher_address') as Promise<string | null>,
      window.api.db.getSetting('researcher_phone') as Promise<string | null>,
      window.api.db.getSetting('researcher_email') as Promise<string | null>,
    ]);
    researcherName.value = name || null;
    researcherAddress.value = address || null;
    researcherPhone.value = phone || null;
    researcherEmail.value = email || null;
  } catch {
    // Silent: header/footer is decorative; if settings fail to load we just hide.
  }
});
</script>

<style scoped>
/*
 * The header/footer is rendered as in-flow blocks inside the report so it
 * is visible in screen preview. For print output the actual repeating
 * page header + footer + page number come from Chromium's
 * displayHeaderFooter/headerTemplate/footerTemplate templates passed to
 * printToPDF (see src/main/ipc/main-only.ts), so this in-flow block is
 * hidden during print to avoid double rendering.
 */
.report-header-footer {
  font-family: var(--report-serif-stack);
  color: var(--text-muted);
  font-size: var(--font-xs);
}
.rhf-header {
  display: flex;
  justify-content: space-between;
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--surface-border-subtle);
  margin-bottom: var(--space-md);
}
.rhf-header .rhf-app { font-weight: 600; color: var(--text-secondary); }
.rhf-footer {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  padding: var(--space-sm) 0;
  border-top: 1px solid var(--surface-border-subtle);
  margin-top: var(--space-xl);
}

@media print {
  .report-header-footer { display: none; }
}
</style>
