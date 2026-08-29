# Changelog

## 0.274.0 — 2026-08-29

- feat: a citation from an ArkivDigital import now offers "Öppna arkivbild", opening the exact archive image that citation was taken from
- feat: that pointer survives an export and re-import, so merging trees no longer loses the route back to the image — 6324 of them across the four test exports, 1764 reachable no other way once duplicate sources are folded together

## 0.273.0 — 2026-08-23

- feat: places from an ArkivDigital export now sit in their real parish and county instead of one flat row per address line — Högnäs under Hedesunda under Gävleborgs län under Sverige
- feat: two parishes that share a name are kept apart, so Viby in Örebro is no longer merged with Viby in Östergötland
- feat: your own notes on an event survive the import — 900 of them were being discarded silently
- feat: the date you consulted each record is kept, on all 6147 citations that carried one
- feat: a person's title, and whether a child is adopted or biological to each parent separately, are both kept
- feat: the ArkivDigital archive link for each source survives an export and re-import, so your route back to the image is not lost

## 0.272.0 — 2026-08-23

- feat: the GEDCOM import report now lists every tag the app did not read, with its path and a count — it previously named 143 of more than 40 000 discarded occurrences
- feat: tags the app deliberately does not model are declared with a written reason, so "not imported" is a visible decision instead of a silent drop

## 0.271.7 — 2026-08-23

- fix: the developer UI bridge answers instead of stalling 15 seconds when a script returns a value it cannot encode

## 0.271.6 — 2026-08-23

- fix: importing a .zip archive shows its report and refreshes the app — it imported silently and left every list stale
- fix: a failed GEDCOM export, archive export, or website export now says so instead of looking like nothing happened
- fix: a failed database backup or restore now reports the failure; cancelling the file dialog stays quiet
- fix: media that cannot be opened in an external app reports why instead of doing nothing

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
