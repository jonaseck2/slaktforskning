// Per-database link-rule configuration backing every <LinkedText> render.
//
// Backed by the `db_settings` row `link_rules_config`. Loaded once per
// session via `init()` (called from App.vue:onMounted) and re-loaded by
// LinkRulesView via `refresh()` after the user saves changes there.
//
// Static-SPA gotcha: `window.api` may be undefined in the bundled SPA used
// by the website export — guard every access.

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  resolveRules,
  type LinkRule,
  type LinkRuleOverrides,
} from '../../api/source-linker';
import { svRules } from '../../api/link-rules/sv';
import { enRules } from '../../api/link-rules/en';
import { deRules } from '../../api/link-rules/de';
import { daRules } from '../../api/link-rules/da';
import { noRules } from '../../api/link-rules/no';
import { universalRules } from '../../api/link-rules/universal';

interface WindowApi {
  api?: {
    db?: {
      getSetting?: (key: string) => Promise<string | null>;
    };
  };
}

function getWindowApi(): WindowApi['api'] | undefined {
  return (globalThis as unknown as WindowApi).api;
}

const SETTING_KEY = 'link_rules_config';
const DEFAULT_CONFIG: LinkRuleOverrides = { enabledLocales: ['sv'], overrides: {} };

const allDefaults: LinkRule[] = [
  ...universalRules,
  ...svRules,
  ...enRules,
  ...deRules,
  ...daRules,
  ...noRules,
];

export const useLinkRulesStore = defineStore('linkRules', () => {
  const config = ref<LinkRuleOverrides>(DEFAULT_CONFIG);
  const loaded = ref(false);

  const rules = computed<LinkRule[]>(() => resolveRules(allDefaults, config.value));

  async function refresh(): Promise<void> {
    const getSetting = getWindowApi()?.db?.getSetting;
    if (!getSetting) {
      loaded.value = true;
      return;
    }
    try {
      const raw = await getSetting(SETTING_KEY);
      if (raw) config.value = JSON.parse(raw) as LinkRuleOverrides;
      else config.value = DEFAULT_CONFIG;
    } catch {
      config.value = DEFAULT_CONFIG;
    }
    loaded.value = true;
  }

  async function init(): Promise<void> {
    if (loaded.value) return;
    await refresh();
  }

  return { config, loaded, rules, init, refresh };
});
