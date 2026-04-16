import { onMounted, onUnmounted, type Ref } from 'vue';
import type { BoxLayout } from '../utils/chart-layout/types';

declare const window: Window & { api: Record<string, Record<string, (...args: unknown[]) => unknown>> };

export function useChartBridge(state: {
  boxes: Ref<BoxLayout[]>;
  selectedPersonId: Ref<string | null>;
  focalPersonId: Ref<string | null>;
  chartType: Ref<string>;
  selectPerson: (id: string) => void;
  focusPerson: (id: string) => void;
}) {
  onMounted(() => {
    // Guard: window.api.chart may be absent in test environments that mock window.api partially.
    if (!window.api.chart) return;

    window.api.chart.onGetVisiblePersons(() => {
      return state.boxes.value
        .filter(b => !b.person.id.startsWith('__ph_'))
        .map(b => ({
          id: b.person.id,
          name: [b.person.givenName, b.person.surname].filter(Boolean).join(' '),
          x: Math.round(b.x),
          y: Math.round(b.y),
          isSelected: b.person.id === state.selectedPersonId.value,
          isFocal: b.isFocal,
        }));
    });

    window.api.chart.onSelectPerson((args: { person_id?: string; name?: string }) => {
      if (args.person_id) {
        const exists = state.boxes.value.some(b => b.person.id === args.person_id);
        if (!exists) return { error: 'Person not visible in current chart' };
        state.selectPerson(args.person_id);
        return { ok: true };
      }
      if (args.name) {
        const match = state.boxes.value.find(b => {
          const fullName = [b.person.givenName, b.person.surname].filter(Boolean).join(' ').toLowerCase();
          return fullName.includes(args.name!.toLowerCase());
        });
        if (!match) return { error: `No visible person matching "${args.name}"` };
        state.selectPerson(match.person.id);
        return { ok: true, matched: match.person.id };
      }
      return { error: 'Provide person_id or name' };
    });

    window.api.chart.onFocusPerson((args: { person_id: string }) => {
      state.focusPerson(args.person_id);
      return { ok: true };
    });

    window.api.chart.onGetLayout(() => ({
      chartType: state.chartType.value,
      focalId: state.focalPersonId.value,
      selectedId: state.selectedPersonId.value,
      boxCount: state.boxes.value.filter(b => !b.person.id.startsWith('__ph_')).length,
    }));
  });

  onUnmounted(() => {
    window.api.chart?.removeAllChartHandlers();
  });
}
