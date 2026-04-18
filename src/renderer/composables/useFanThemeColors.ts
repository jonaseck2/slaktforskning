// Reactive wrapper for the pure fan-chart theme helpers in `fanColors.ts`.
//
// The helpers `readThemeColors`, `isDarkMode`, and `isHighContrast` each read
// from `document.documentElement` directly. Wrapping them in a `computed`
// keyed off `useThemeSignal()` turns theme/appearance switches into reactive
// invalidations, so chart `:fill` attributes rebind automatically.

import { computed, type ComputedRef } from 'vue';
import {
  readThemeColors,
  isDarkMode,
  isHighContrast,
  type ThemeColors,
} from '../utils/fanColors';
import { useThemeSignal } from './useThemeSignal';

export interface FanThemeState {
  theme: ThemeColors;
  dark: boolean;
  highContrast: boolean;
}

export function useFanThemeColors(): ComputedRef<FanThemeState> {
  const themeVersion = useThemeSignal();
  return computed<FanThemeState>(() => {
    void themeVersion.value;
    return {
      theme: readThemeColors(),
      dark: isDarkMode(),
      highContrast: isHighContrast(),
    };
  });
}
