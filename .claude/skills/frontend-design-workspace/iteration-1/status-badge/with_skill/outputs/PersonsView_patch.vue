<!--
  PATCH: living/deceased status badge for PersonsView
  =====================================================
  This patch shows only the changed parts of the file:
    1. Updated PersonListItem interface (adds `living` field)
    2. Updated SQL query in persons.ts to expose `p.living`
    3. New table header column
    4. Row template — badge cell
    5. Scoped style additions

  NOTE: The `living` field is NOT returned by the current listPersonsPage query.
  A companion change to src/api/persons.ts is required:
    - Add `p.living` to the SELECT in PERSON_LIST_BASE_QUERY
    - Add `living: boolean` to the PersonListItem type

  === 1. Updated PersonListItem interface (PersonsView.vue) ===
-->

<!-- Interface change (inside <script setup>) -->
<!--
interface PersonListItem {
  id: string;
  sex: string;
  living: boolean;          // <-- ADD THIS
  given_name: string;
  surname: string;
  birth_date: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_place: string | null;
}
-->

<!-- === 2. New <th> column (after the sex column) === -->
<!--
  Add after: <th>{{ $t('persons.sex') }}</th>
-->
<th>{{ $t('persons.status') }}</th>

<!-- === 3. New <td> badge cell (inside the v-for row, after the sex badge cell) === -->
<!--
  Add after:
    <td><span :class="'sex-badge sex-' + person.sex">{{ person.sex }}</span></td>
-->
<td>
  <span :class="person.living ? 'status-badge status-living' : 'status-badge status-deceased'">
    {{ person.living ? $t('persons.living') : $t('persons.deceased') }}
  </span>
</td>

<!-- === 4. i18n keys to add (en.ts and sv.ts) ===
  In the `persons` section:
    status: 'Status',
    deceased: 'Deceased',       // `persons.living` already exists (line 53)

  Swedish (sv.ts):
    status: 'Status',
    deceased: 'Avliden',        // `persons.living` = 'Levande' already exists
-->

<!-- === 5. companion change to src/api/persons.ts ===
  In PERSON_LIST_BASE_QUERY SELECT list, add after `p.sex,`:
    p.living,

  In PersonListItem type, add:
    living: boolean;
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
  color: #15803d;
}
.status-deceased {
  background: var(--color-bg-muted);
  color: var(--color-text-subtle);
}
</style>
