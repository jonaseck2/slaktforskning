# Changelog

## 0.271.5 — 2026-08-23

- fix: importing a standard GEDCOM works again — picking a file showed no preview, no error, and nothing in the log
- fix: a successful GEDCOM import no longer reports itself as failed
- fix: GEDCOM import accepts a .zip containing a .ged again, and files media into the database's media folder
- test: the end-to-end suite runs the build you just made instead of whichever bundle was built last
- test: end-to-end runs use their own throwaway database again instead of the last one you opened

## 0.271.4 — 2026-08-22

- chore: Pinia, Vue Router and Vue I18n updated, with security patches for bundled libraries
- fix: the bundled third-party license list builds again after the Vue Router update

## 0.271.3 — 2026-06-18

- fix: Swedish place names written with a municipality/parish suffix now resolve to the right place instead of a same-coded foreign country — "Ängby, Stockholms kn" lands in Sweden (not Saint Kitts and Nevis, ISO "KN"), "Mo, Bergs kn" in Sweden (not Macao, ISO "MO"); the merged place index now applies the same name-suffix rules ("kn", "sn", "kommun", …) the per-region indexes already used

## 0.271.2 — 2026-06-18

- fix: Swedish and Nordic place names no longer land in the wrong country — "Västra Vingåkers sn" stays in Sweden (not Senegal), "Torsvi by" in Sweden (not Belarus), "Tun, Lidköpings kn" in Sweden (not Tunisia); the resolver no longer mistakes abbreviations like "sn" (socken) or "by" (village) for ISO country codes
- fix: modern places no longer resolve to historical empires — "New York" → United States, "Rasht, Iran" → Iran, "Spanien" → Spain, "Edum" → Sweden, instead of Estado Novo / Qajar Iran / Spanish Empire / Edom
- fix: a place that resolves to one clear location is no longer wrongly flagged "ambiguous" — Turkiet, Voss, Barcelona, and Genève now show a clean match; a genuine multi-place namesake with no country hint (e.g. "Kärret, Hov") is still flagged so you can choose

## 0.271.1 — 2026-06-17

- perf: exporting a 20 000+ person tree to GEDCOM now finishes in about a second instead of minutes
- perf: actions that load the whole person list on a large tree are fast again, not multi-second

## 0.271.0 — 2026-06-17

- feat: exporting (GEDCOM, website, or archive) now shows a live progress line while it runs, so a large export no longer looks frozen
- perf: GEDCOM export of large trees no longer runs a separate database query per person and event for notes, associations, and name/place translations — they are fetched in bulk up front (on a 22 000-person tree this removes ~150 000 tiny queries)
- fix: exporting GEDCOM from the app now respects the GEDCOM 7.0 choice and your export options, which were previously ignored

## 0.270.6 — 2026-06-17

- perf: editing data (a name, a date, a place) now updates the family-tree chart, lists, and panels right away even on databases with tens of thousands of people — the sidebar Quality and Duplicates badge counts no longer trigger a full-database scan on every edit (they refresh when you open those pages). Previously a single edit could take ~5 seconds to show up in the chart on a large tree.

## 0.270.5 — 2026-06-17

- fix: the search box no longer loses focus after each letter you type — you can type a query straight through without re-clicking the field

## 0.270.4 — 2026-06-14

- fix: the map in the Place Chronicle report no longer shows a dead blank box — it resolves the place location from the gazetteer (the same path the Places map uses) and always renders, centering a single place at a readable zoom

## 0.270.3 — 2026-06-14

- fix: searching the person list down to zero matches keeps the search box and shows a "no matches" message instead of the welcome screen, so you can refine or clear the search

---

*Earlier release notes archived. See [docs/plans/archive/CHANGELOG.md](docs/plans/archive/CHANGELOG.md) for older entries; the complete per-milestone development history (commit-level detail, RCA write-ups, design rationale) lives in [docs/plans/archive/PLAN.md](docs/plans/archive/PLAN.md) and the git log.*
