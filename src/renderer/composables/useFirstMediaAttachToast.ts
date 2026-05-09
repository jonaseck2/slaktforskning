// src/renderer/composables/useFirstMediaAttachToast.ts
//
// Shows a one-shot info toast the very first time a user successfully
// attaches a media file in this installation. Tells them WHERE the file
// went — i.e. that the app silently copied it into the sibling
// `<dbname>-media/` folder so it travels with the database.
//
// Background (Bengt's beta feedback #13b): Bengt attached a media file
// and later saw a "media file missing" warning. He didn't realise the
// app had copied the file into a `<dbname>-media/` folder, so he didn't
// know what to look for. This toast surfaces that side effect on first
// successful attach, then never again.

import { useFirstEncounter } from './useFirstEncounter';
import { useToast } from './useToast';
import { useI18n } from 'vue-i18n';

const KEY = 'toast.media.firstAttach';

export function useFirstMediaAttachToast() {
  const firstAttach = useFirstEncounter(KEY);
  const toast = useToast();
  const { t } = useI18n();

  /**
   * Call after a successful media-attach IPC call (one that actually
   * copies a file into `<dbname>-media/`). Idempotent: only the first
   * call per installation shows the toast.
   */
  async function notifyIfFirst(): Promise<void> {
    if (firstAttach.seen.value) return;
    toast.info(t('onboarding.toast.mediaFirstAttach.body'));
    await firstAttach.markSeen();
  }

  return { notifyIfFirst };
}
