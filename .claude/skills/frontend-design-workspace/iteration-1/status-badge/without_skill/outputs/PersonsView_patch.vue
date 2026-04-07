<!--
  PATCH: Living/deceased status badge for person rows in PersonsView.vue

  Changes required:
  1. Add `living: boolean` to the PersonListItem interface (script section)
  2. Add `p.living` to the PERSON_LIST_BASE_QUERY SELECT in src/api/persons.ts
     and add `living: boolean` to the PersonListItem type there
  3. Add a "Status" column header to the table <thead>
  4. Add the badge cell to each <tr> in <tbody> (shown below)
  5. Add scoped styles (shown below)

  === TEMPLATE PATCH ===
  Replace the <thead> <tr> block and <tbody> <tr> block as follows:
-->

<!-- thead — add Status column after Death Place, before Actions -->
<thead>
  <tr>
    <th>{{ $t('persons.givenName') }}</th>
    <th>{{ $t('persons.surname') }}</th>
    <th>{{ $t('persons.sex') }}</th>
    <th>{{ $t('persons.birthDate') }}</th>
    <th>{{ $t('persons.birthPlace') }}</th>
    <th>{{ $t('persons.deathDate') }}</th>
    <th>{{ $t('persons.deathPlace') }}</th>
    <th>{{ $t('personDetail.statusLabel') }}</th>
    <th class="actions-cell">{{ $t('common.actions') }}</th>
  </tr>
</thead>

<!-- tbody row — add status badge cell -->
<tr
  v-for="person in persons"
  :key="person.id"
  class="clickable-row"
  @click="goToDetail(person)"
>
  <td>
    <router-link :to="'/persons/' + person.id" class="person-link" @click.stop>
      <PersonName :given-name="person.given_name" :preferred-name="null" :nickname="null" />
    </router-link>
  </td>
  <td>{{ person.surname }}</td>
  <td><span :class="'sex-badge sex-' + person.sex">{{ person.sex }}</span></td>
  <td>{{ person.birth_date ?? '' }}</td>
  <td>{{ person.birth_place ?? '' }}</td>
  <td>{{ person.death_date ?? '' }}</td>
  <td>{{ person.death_place ?? '' }}</td>
  <td>
    <span :class="person.living ? 'status-badge status-living' : 'status-badge status-deceased'">
      {{ person.living ? $t('personDetail.statusLiving') : $t('personDetail.statusDeceased') }}
    </span>
  </td>
  <td class="actions-cell">
    <button class="btn-sm btn-delete" @click.stop="removePerson(person.id)">✕</button>
  </td>
</tr>

<!--
  === SCRIPT PATCH ===
  Update PersonListItem interface to include living:

  interface PersonListItem {
    id: string;
    sex: string;
    living: boolean;          // <-- add this field
    given_name: string;
    surname: string;
    birth_date: string | null;
    birth_place: string | null;
    death_date: string | null;
    death_place: string | null;
  }

  === API PATCH (src/api/persons.ts) ===
  1. Add `living: boolean` to the PersonListItem type after `sex`.
  2. Add `p.living,` to the PERSON_LIST_BASE_QUERY SELECT after `p.sex,`.
-->

<style scoped>
/* Status badge — living/deceased */
.status-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
  font-weight: 600;
  white-space: nowrap;
}
.status-living {
  background: #dcfce7;
  color: #166534;
}
.status-deceased {
  background: #f3f4f6;
  color: #6b7280;
}
</style>
