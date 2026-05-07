<template>
  <div v-if="hasContent" class="media-caption" tabindex="0" v-narrate="captionPlainText">
    <template v-if="showCaptions">
      <div v-if="contextLine" class="caption-context">{{ contextLine }}</div>
      <div v-if="faceTags.length" class="caption-faces">
        <span class="faces-prefix">{{ t('reports.common.fromLeft') }}</span>
        <template v-for="(tag, i) in faceTags" :key="tag.personId">
          <a
            v-if="isLinked(tag.personId)"
            :href="hrefFor(tag.personId)"
            class="face-link"
            @click="onPersonClick($event, tag.personId)"
          >{{ tagLabel(tag) }}</a>
          <span v-else class="face-name">{{ tagLabel(tag) }}</span>
          <span v-if="i < faceTags.length - 1">, </span>
        </template>
      </div>
      <div v-if="inferredDateISO" class="caption-date">{{ inferredDateISO.slice(0, 10) }}</div>
    </template>
    <LinkedText v-if="showNotes && notes" :text="notes" :enabled="linkifyNotes" class="caption-notes" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import LinkedText from './LinkedText.vue';

export interface CaptionFaceTag {
  personId: string;
  name: string;
  x: number;
}

const props = withDefaults(defineProps<{
  faceTags: CaptionFaceTag[];
  notes?: string | null;
  inferredDateISO?: string | null;
  contextLine?: string | null;
  relations?: Record<string, string> | null;
  linkedPersonIds?: string[] | null;
  showCaptions?: boolean;
  showNotes?: boolean;
  linkifyNotes?: boolean;
  hrefBuilder?: ((personId: string) => string) | null;
}>(), {
  notes: null,
  inferredDateISO: null,
  contextLine: null,
  relations: null,
  linkedPersonIds: null,
  showCaptions: true,
  showNotes: true,
  linkifyNotes: true,
  hrefBuilder: null,
});

const emit = defineEmits<{
  personClick: [personId: string, event: MouseEvent];
}>();

const { t } = useI18n();

const hasContent = computed(() => {
  if (props.showCaptions && (props.contextLine || props.faceTags.length > 0 || props.inferredDateISO)) return true;
  if (props.showNotes && props.notes) return true;
  return false;
});

const captionPlainText = computed(() => {
  const parts: string[] = [];
  if (props.contextLine) parts.push(props.contextLine);
  if (props.faceTags && props.faceTags.length > 0) {
    parts.push('From left: ' + props.faceTags.map(f => f.name).join(', '));
  }
  if (props.inferredDateISO) parts.push(props.inferredDateISO.slice(0, 10));
  if (props.notes) parts.push(props.notes);
  return parts.join('. ');
});

function isLinked(personId: string): boolean {
  if (props.linkedPersonIds === null) return true;
  return props.linkedPersonIds.includes(personId);
}

function tagLabel(tag: CaptionFaceTag): string {
  const relation = props.relations?.[tag.personId];
  return relation ? `${relation} ${tag.name}` : tag.name;
}

function hrefFor(personId: string): string {
  return props.hrefBuilder ? props.hrefBuilder(personId) : '#';
}

function onPersonClick(event: MouseEvent, personId: string) {
  emit('personClick', personId, event);
}
</script>

<style scoped>
.media-caption {
  margin-top: var(--space-sm);
  font-size: var(--font-sm);
  font-style: italic;
}
.caption-context { color: var(--text-secondary); font-style: italic; }
.caption-date { color: var(--text-muted); }

.caption-faces {
  margin-top: 2px;
  color: var(--text-secondary);
}
.faces-prefix {
  margin-right: 3px;
  font-style: italic;
}
.face-name {
  color: inherit;
}
.face-link {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--surface-border-subtle);
  transition: color 0.15s, border-color 0.15s;
}
.face-link:hover {
  color: var(--accent);
  border-color: var(--accent);
}

@media print {
  .face-link { border-bottom: none; }
}
</style>
