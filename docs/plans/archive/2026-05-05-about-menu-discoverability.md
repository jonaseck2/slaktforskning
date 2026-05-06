# Implementation: Restore "About OurLegacy" discoverability

**Date:** 2026-05-05
**Branch strategy:** main (small fix)
**Source:** Beta tester report 57 (v0.215.2)

## User goal

Find "About OurLegacy" without hunting. The user remembers it existed in an earlier version and can't find it now. They should be able to open it from a predictable place — Help menu, settings, or both — without searching.

## Investigation first

The component `src/renderer/components/AboutModal.vue` exists and is wired in `src/renderer/App.vue` line 240. It's opened via the `app:openAbout` IPC event, fired from the Electron Help menu in `src/main/index.ts` line 162.

**Before writing code, verify the actual symptom.** Run the app on macOS and Windows/Linux; check:

1. Does the Help menu still contain an "About OurLegacy" entry on the platform the user is on?
2. On macOS, is it under the application menu (`OurLegacy → About OurLegacy`) instead of the Help menu, per platform convention?
3. Is the menu hidden on a particular packaging mode (dev vs packaged)?
4. Did a recent refactor remove the menu entry while keeping the IPC channel?

If the menu entry is gone, restore it. If it's just hard to find, add a second entry path.

## Scope

Two access paths to About should exist:

1. **Native menu** — Help → About OurLegacy (or app menu on macOS, per OS convention). Required.
2. **Settings → bottom of `SettingsView.vue`** — small "About OurLegacy" link/button that opens the same modal. The user looks here when the menu fails them.

### Scope deviations

- Sidebar / topbar item for About: out of scope. About is a low-frequency action; menu + settings is enough.
- Updating the AboutModal content itself: out of scope unless a field is wrong.

## Tasks

- [x] **Audit** — `src/main/index.ts` already had About in the Help menu (line 156-171) wired to `app:openAbout`, but on macOS the convention is the app menu, not Help. Discovery problem confirmed.
- [x] **Add macOS app menu** with "About OurLegacy" first entry, plus services/hide/quit roles per macOS convention. Both paths fire the same `app:openAbout` IPC. Help menu's About kept as the cross-platform fallback.
- [x] **Add Settings footer link** in `SettingsView.vue` — "About OurLegacy" button below the tabs, divider above. Dispatches a `window.dispatchEvent('app:openAbout')` CustomEvent; `App.vue` listens and toggles `aboutVisible`. AboutModal is reused, not duplicated.
- [x] **i18n keys** `about.openLink` added in both locales.
- [x] **Patch bump** + CHANGELOG entry.

## Verification (user-observable)

1. Launch the packaged app on the user's platform. Open the Help menu (or app menu on macOS). "About OurLegacy" is visible. Click it → modal opens with version + GitHub link.
2. Close menu. Navigate to Settings. Scroll to the bottom. "About OurLegacy" link is visible. Click → same modal opens.
3. Modal shows the current `package.json` version (read from `app.getVersion()`).
4. Both locales: link/menu text is localized.

## Failure modes / RCA reference

- **macOS "About" lives in the app menu, not Help.** Don't move it to Help on macOS — that violates platform convention. `role: 'about'` does the right thing.
- **Menu entry exists but IPC is broken.** If `app:openAbout` fires but the modal doesn't appear, check that `App.vue` mounted before the menu was clickable. The `onOpenAbout` listener registers in setup; if it's racing menu activation on app startup, switch to a queue.
- **Don't duplicate the modal content.** A common drift: when a button is added in Settings, someone forks the modal layout. Keep one `AboutModal.vue`; both entry points open the same component.
