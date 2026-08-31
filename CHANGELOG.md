# Changelog

## 0.276.1 — 2026-08-29

- fix: deleting a source, citation, place, photograph or repository now removes its archive identifiers too, instead of leaving rows behind that made an approved duplicate group reappear on every review
- fix: undoing such a delete brings those identifiers back, with their original ids

## 0.276.0 — 2026-08-29

- feat: an archive identifier written by any program now survives an export and re-import, whatever it was attached to — sources, repositories, photographs, citations and places, not only the three ArkivDigital cases that worked before
- feat: seven identifiers in the four real ArkivDigital exports were being dropped on every export and are now kept
- feat: a parish recorded without a county above it keeps its ArkivDigital parish id instead of losing it
- feat: a place recorded only against a source citation, with no event naming it, keeps its identifiers
- fix: an identifier from a program this app has never heard of — a Gramps handle, a RootsMagic id — is written back out instead of discarded

## 0.275.0 — 2026-08-29

- feat: pick several export files at once and import them in one action — every importer, not just GEDCOM
- feat: afterwards, a review step groups what arrived more than once: one row per archive volume instead of thousands of pairs, and nothing merges until you approve it
- feat: approving a group is a single undo away, however many records it held
- feat: a child recorded as adopted, step or foster keeps that relation — and one the file left unstated is no longer recorded as biological
- feat: a married name imported from RootsMagic stays a married name
- feat: a parish written beside a place by Holger becomes a real place instead of a dropped line
- feat: a photograph's format and per-file title survive the import instead of falling back to the filename
- feat: a couple recorded as sambo reads as a cohabitation, with the date it started
- feat: a date typed in free text appears on the event where it was written, unparsed
- fix: an archive identifier now follows the surviving record through a merge, so an approved group stops reappearing

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
