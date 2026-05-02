<template>
  <div>
    <div v-if="showPicker" class="add-row">
      <PersonPicker v-model="pickedId" :placeholder="$t('common.unknown')" />
      <AppButton variant="primary" size="sm" :disabled="!pickedId" @click="onAdd">{{ $t('common.add') }}</AppButton>
      <AppButton variant="ghost" size="sm" @click="cancelAdd">{{ $t('common.cancel') }}</AppButton>
    </div>
    <SectionEmpty v-if="rows.length === 0 && !showPicker" :message="$t('empty.persons')" />
    <table v-else-if="rows.length > 0" class="data-table">
      <thead>
        <tr>
          <th>{{ $t('common.name') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.linkId">
          <td>
            <span class="member-cell">
              <AppAvatar
                :person-id="r.personId"
                :given-name="r.given_name ?? ''"
                :surname="r.surname ?? ''"
                :preferred-name="r.preferred_name"
                :sex="(r.sex as 'M' | 'F' | 'U')"
                size="sm"
              />
              <router-link :to="'/persons/' + r.personId" class="person-link" @click.stop>
                <!-- Display only — see plan birth-name-display-and-quality-check. -->
                <PersonName
                  :given-name="r.given_name"
                  :surname="r.surname"
                  :preferred-name="r.preferred_name"
                  :nickname="r.nickname"
                  :birth-surname="r.birth_surname"
                  :show-birth-name-parenthetical="personNameOptions.showBirthNameParenthetical"
                />
              </router-link>
            </span>
          </td>
          <td class="actions-cell">
            <AppButton
              variant="ghost"
              size="sm"
              :aria-label="$t('a11y.unlinkItem', { item: ((r.given_name || '') + ' ' + (r.surname || '')).trim() })"
              :title="$t('common.unlinkTooltip')"
              @click="emit('remove', r.linkId)"
            >
              <IconUnlink :size="14" />
            </AppButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import PersonPicker from './PersonPicker.vue';
import { pickDisplayedName, pickBirthSurnameForDisplay } from '../utils/nameUtils';
import PersonName from './PersonName.vue';
import { usePersonNameOptions } from '../stores/personNameOptions';

// Display only — see plan birth-name-display-and-quality-check.
const personNameOptions = usePersonNameOptions();
import AppAvatar from './ui/AppAvatar.vue';
import AppButton from './ui/AppButton.vue';
import IconUnlink from './ui/IconUnlink.vue';
import SectionEmpty from './ui/SectionEmpty.vue';

interface LinkInput { id: string; entity_id: string }

interface Row {
  linkId: string;
  personId: string;
  given_name: string | null;
  surname: string | null;
  preferred_name: string | null;
  nickname: string | null;
  /** Display only — see plan birth-name-display-and-quality-check. */
  birth_surname: string | null;
  sex: string;
}

const props = defineProps<{
  links: LinkInput[];
  showPicker: boolean;
}>();

const emit = defineEmits<{
  add: [personId: string];
  remove: [linkId: string];
  cancelPicker: [];
}>();

const rows = ref<Row[]>([]);
const pickedId = ref<string | null>(null);

watch(() => props.links, async (links) => {
  const out: Row[] = [];
  for (const l of links) {
    const names = await window.api.persons.getNames(l.entity_id) as Array<{
      id: string; given_name: string | null; surname: string | null;
      preferred_name: string | null; nickname: string | null;
      sort_order: number; name_type: string; date_from: string | null;
    }>;
    const [p, events] = await Promise.all([
      window.api.persons.get(l.entity_id) as Promise<{ sex: string } | null>,
      window.api.events.forPerson(l.entity_id) as Promise<Array<{ event_type: string; date_value: string | null }>>,
    ]);
    const n = pickDisplayedName(names, events) ?? { id: null, given_name: null, surname: null, preferred_name: null, nickname: null };
    const birthSurname = pickBirthSurnameForDisplay(n as { id?: string | null; surname?: string | null }, names as Parameters<typeof pickBirthSurnameForDisplay>[1]);
    out.push({ linkId: l.id, personId: l.entity_id, given_name: n.given_name, surname: n.surname, preferred_name: n.preferred_name, nickname: n.nickname, birth_surname: birthSurname, sex: p?.sex ?? '' });
  }
  rows.value = out;
}, { immediate: true, deep: true });

watch(() => props.showPicker, (v) => { if (!v) pickedId.value = null; });

function onAdd() {
  if (!pickedId.value) return;
  const id = pickedId.value;
  pickedId.value = null;
  emit('add', id);
}

function cancelAdd() {
  pickedId.value = null;
  emit('cancelPicker');
}
</script>

<style scoped>
.add-row {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  padding: var(--space-xs) 0;
}
.add-row > :first-child { flex: 1; }
.member-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
</style>
