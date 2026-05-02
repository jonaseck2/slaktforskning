<template>
  <div class="family-in-year-report">
    <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="data">
      <!-- Cover -->
      <ReportCover
        :title="$t('reports.familyInYear.title', { year: data.year })"
        :subtitle="$t('reports.familyInYear.subtitle')"
        :researcher-name="researcherName"
      />

      <!-- TODO: render LifeMap when getAliveInYear returns lat/lon -->

      <!-- Families -->
      <section v-if="data.families.length > 0" class="report-section">
        <h2 class="section-heading">{{ $t('reports.familyInYear.families') }}</h2>
        <div v-for="f in data.families" :key="f.relationshipId" class="family-block">
          <h3 class="family-heading">{{ familyLabel(f) }}</h3>
          <div class="members-grid">
            <PersonMiniCard
              v-for="p in allPeopleInFamily(f)"
              :key="p.id"
              v-bind="cardProps(p)"
            />
          </div>
        </div>
      </section>

      <!-- Unattached individuals -->
      <section v-if="data.unattached.length > 0" class="report-section">
        <h2 class="section-heading">{{ $t('reports.familyInYear.individuals') }}</h2>
        <div class="individuals-grid">
          <PersonMiniCard
            v-for="p in data.unattached"
            :key="p.id"
            v-bind="cardProps(p)"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ReportCover from './primitives/ReportCover.vue';
import PersonMiniCard from './primitives/PersonMiniCard.vue';
import { redactPerson } from '../../utils/reportPrivacy';
import { useToast } from '../../composables/useToast';

interface AliveInYearPerson {
  id: string;
  given_name: string | null;
  surname: string | null;
  birth_surname: string | null;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  birthYear: number | null;
  deathYear: number | null;
  age: number | null;
  placeName: string | null;
}

interface AliveInYearFamily {
  relationshipId: string;
  parents: AliveInYearPerson[];
  children: AliveInYearPerson[];
}

interface AliveInYearResult {
  year: number;
  persons: AliveInYearPerson[];
  families: AliveInYearFamily[];
  unattached: AliveInYearPerson[];
}

const props = withDefaults(defineProps<{
  year: number;
  scope?: 'all' | 'ancestors' | 'descendants';
  scopePersonId?: string | null;
  redactLiving?: boolean;
  showBirthNameParenthetical?: boolean;
}>(), {
  scope: 'all',
  scopePersonId: null,
  redactLiving: false,
  showBirthNameParenthetical: true,
});

const { t } = useI18n();
const toast = useToast();

const loading = ref(false);
const error = ref<string | null>(null);
const data = ref<AliveInYearResult | null>(null);
const researcherName = ref<string | null>(null);

// Display only — see plan birth-name-display-and-quality-check.
function personDisplayName(p: AliveInYearPerson): string {
  const base = [p.given_name, p.surname].filter(Boolean).join(' ');
  if (!base) return t('common.unknown');
  if (props.showBirthNameParenthetical && p.birth_surname && p.birth_surname !== p.surname) {
    return `${base} (${t('common.bornAbbrev')} ${p.birth_surname})`;
  }
  return base;
}

function familyLabel(f: AliveInYearFamily): string {
  if (f.parents.length === 0) return t('common.unknown');
  return f.parents.map(personDisplayName).join(' + ');
}

function allPeopleInFamily(f: AliveInYearFamily): AliveInYearPerson[] {
  return [...f.parents, ...f.children];
}

function cardProps(p: AliveInYearPerson) {
  const r = redactPerson(
    {
      id: p.id,
      living: p.living,
      birthYear: p.birthYear,
      deathYear: p.deathYear,
    },
    { redactLiving: props.redactLiving === true },
  );
  return {
    personId: p.id,
    givenName: p.given_name,
    surname: p.surname,
    // Display only — see plan birth-name-display-and-quality-check.
    birthSurname: p.birth_surname,
    showBirthNameParenthetical: props.showBirthNameParenthetical,
    sex: p.sex,
    birthYear: r.birthYear ?? null,
    deathYear: r.deathYear ?? null,
    keyPlace: p.placeName,
  };
}

async function load() {
  if (!Number.isFinite(props.year)) {
    data.value = null;
    return;
  }
  loading.value = true;
  error.value = null;
  data.value = null;
  try {
    // v1 implements scope: 'all' only. TODO: filter by ancestors/descendants
    // of scopePersonId when scope !== 'all'.
    const [raw, researcher] = await Promise.all([
      window.api.reports.aliveInYear(props.year) as Promise<AliveInYearResult | null>,
      window.api.db.getSetting('researcher_name') as Promise<string | null>,
    ]);
    data.value = raw;
    researcherName.value = researcher || null;
  } catch (err) {
    console.error('[FamilyInYearReport] load failed:', err);
    toast.error(t('errors.loadFailed'));
    error.value = t('reports.loadFailed.familyInYear');
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.year, props.scope, props.scopePersonId] as const,
  load,
  { immediate: true },
);
</script>

<style scoped>
.family-in-year-report {
  font-family: var(--report-serif-stack);
}
.loading, .error {
  color: var(--text-muted);
  font-size: var(--font-sm);
  padding: var(--space-md) 0;
}
.error { color: var(--error-text); }

.report-section {
  padding: var(--space-xl) 0;
  page-break-inside: avoid;
}
.section-heading {
  font-family: var(--report-serif-stack);
  font-size: 1.5rem;
  margin-bottom: var(--space-lg);
}

.family-block { margin-bottom: var(--space-xl); page-break-inside: avoid; }
.family-heading {
  font-family: var(--report-serif-stack);
  font-size: 1.15rem;
  margin: 0 0 var(--space-sm);
  color: var(--text-primary);
}

.members-grid,
.individuals-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-md);
}
</style>
