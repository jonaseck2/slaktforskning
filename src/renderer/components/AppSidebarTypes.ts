import type { Ref } from 'vue';

export interface NavItemDef {
  to: string;
  icon: string;
  labelKey: string;
  badge?: Ref<number> | { value: number };
  ariaLabel?: string;
}

export interface NavSectionDef {
  key: string;
  labelKey?: string;
  items: NavItemDef[];
}
