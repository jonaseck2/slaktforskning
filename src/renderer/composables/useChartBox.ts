import type { ComputedRef, Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { wrapFullNameSegments, truncateToWidth } from '../utils/chart-layout/measure';
import { BOX_PAD_Y, PORTRAIT_H, TEXT_AREA_W } from '../utils/chart-layout';
import type { BoxLayout } from '../utils/chart-layout';
import type { ChartColors } from './useChartColors';
import type { ColorMode } from '../../api/chart-export';

// The shape returned by applyColorMode(useChartColors(...)) is the named
// `ChartColors` interface exported from useChartColors.ts. We import that
// named type rather than a local literal so box-render helpers stay
// structurally coupled to the real palette.

export function useChartBox(opts: {
  colors: ComputedRef<ChartColors>;
  colorMode: ComputedRef<ColorMode>;
  selectedId: Ref<string | null>;
}) {
  const { t } = useI18n();
  const { colors, colorMode, selectedId } = opts;

  function sexBg(sex: string): string {
    if (sex === 'M') return colors.value.sexMBg;
    if (sex === 'F') return colors.value.sexFBg;
    return colors.value.sexUBg;
  }
  function isHighlighted(box: BoxLayout): boolean {
    return !!selectedId.value && box.person.id === selectedId.value;
  }
  function boxFill(box: BoxLayout): string {
    if (isHighlighted(box)) return colors.value.boxFocal;
    if (colorMode.value === 'sex-colored') return sexBg(box.person.sex);
    if (!box.person.living) return colors.value.boxDeceased;
    return colors.value.boxBg;
  }
  function boxStroke(box: BoxLayout): string {
    return isHighlighted(box) ? colors.value.focalStroke : colors.value.boxStroke;
  }
  function nameColor(box: BoxLayout): string {
    return isHighlighted(box) ? colors.value.textFocal : colors.value.text;
  }
  function dateColor(box: BoxLayout): string {
    return isHighlighted(box) ? colors.value.textFocalSub : colors.value.textSub;
  }
  function portraitBg(box: BoxLayout): string {
    return sexBg(box.person.sex);
  }
  function portraitTextColor(): string {
    return '#ffffff';
  }
  function wrappedName(box: BoxLayout) {
    return wrapFullNameSegments(
      box.person.givenName,
      box.person.surname,
      box.person.preferredName,
      box.person.nickname,
      TEXT_AREA_W,
      12,
    );
  }
  function birthText(box: BoxLayout): string {
    const parts = [box.person.birthDate, box.person.birthPlace].filter(Boolean).join(' ');
    if (!parts) return '';
    return truncateToWidth('* ' + parts, TEXT_AREA_W, 10);
  }
  function deathText(box: BoxLayout): string {
    const parts = [box.person.deathDate, box.person.deathPlace].filter(Boolean).join(' ');
    if (!parts) return '';
    return truncateToWidth('† ' + parts, TEXT_AREA_W, 10);
  }
  function initials(box: BoxLayout): string {
    const given = box.person.preferredName ?? box.person.givenName ?? '';
    const sur = box.person.surname ?? '';
    const g = given.trim()[0] ?? '';
    const s = sur.trim()[0] ?? '';
    return (g + s).toUpperCase() || '?';
  }
  function nameStartY(box: BoxLayout): number {
    return box.y + BOX_PAD_Y + 12; // 12px font-size
  }
  function portraitY(box: BoxLayout): number {
    return box.y + (box.h - PORTRAIT_H) / 2;
  }
  function birthY(box: BoxLayout): number {
    const lines = wrappedName(box);
    return box.y + BOX_PAD_Y + lines.length * 16 + 10;
  }
  function deathY(box: BoxLayout): number {
    const hasBirth = !!(box.person.birthDate || box.person.birthPlace);
    return birthY(box) + (hasBirth ? 14 : 0);
  }
  function placeholderLabel(role: string): string {
    const labels: Record<string, string> = {
      father: t('personDetail.addFather'),
      mother: t('personDetail.addMother'),
      spouse: t('personDetail.addSpouse'),
      son: t('personDetail.addSon'),
      daughter: t('personDetail.addDaughter'),
    };
    return labels[role] ?? role;
  }
  function boxAriaLabel(box: BoxLayout): string {
    const name = ((box.person.givenName ?? '') + ' ' + (box.person.surname ?? '')).trim();
    const birth = box.person.birthDate ? '* ' + box.person.birthDate : '';
    const death = box.person.deathDate ? '† ' + box.person.deathDate : '';
    return [name || t('common.unknown'), birth, death].filter(Boolean).join(', ');
  }

  return {
    sexBg,
    isHighlighted,
    boxFill,
    boxStroke,
    nameColor,
    dateColor,
    portraitBg,
    portraitTextColor,
    wrappedName,
    birthText,
    deathText,
    initials,
    nameStartY,
    portraitY,
    birthY,
    deathY,
    placeholderLabel,
    boxAriaLabel,
  };
}
