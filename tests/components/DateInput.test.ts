import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DateInput from '../../src/renderer/components/DateInput.vue';
import { i18n } from './setup';

function mountDateInput(props: Partial<{
  dateType: string;
  dateValue: string;
  dateValueEnd: string;
  dateOriginal: string;
}> = {}) {
  return mount(DateInput, {
    global: { plugins: [i18n] },
    props: {
      dateType: 'exact',
      dateValue: '',
      dateValueEnd: '',
      dateOriginal: '',
      ...props,
    },
  });
}

describe('DateInput', () => {
  describe('date parsing', () => {
    it('splits dateValue into year/month/day fields', () => {
      const wrapper = mountDateInput({ dateValue: '1850-03-15' });
      const inputs = wrapper.findAll('.ymd-group input');
      expect((inputs[0].element as HTMLInputElement).value).toBe('1850');
      expect((inputs[1].element as HTMLInputElement).value).toBe('03');
      expect((inputs[2].element as HTMLInputElement).value).toBe('15');
    });

    it('handles year-only date', () => {
      const wrapper = mountDateInput({ dateValue: '1900' });
      const inputs = wrapper.findAll('.ymd-group input');
      expect((inputs[0].element as HTMLInputElement).value).toBe('1900');
      expect((inputs[1].element as HTMLInputElement).value).toBe('');
      expect((inputs[2].element as HTMLInputElement).value).toBe('');
    });

    it('handles year-month date', () => {
      const wrapper = mountDateInput({ dateValue: '1900-06' });
      const inputs = wrapper.findAll('.ymd-group input');
      expect((inputs[0].element as HTMLInputElement).value).toBe('1900');
      expect((inputs[1].element as HTMLInputElement).value).toBe('06');
      expect((inputs[2].element as HTMLInputElement).value).toBe('');
    });

    it('handles empty dateValue', () => {
      const wrapper = mountDateInput({ dateValue: '' });
      const inputs = wrapper.findAll('.ymd-group input');
      expect((inputs[0].element as HTMLInputElement).value).toBe('');
    });
  });

  describe('date building (emit)', () => {
    it('emits year-only when only year entered', async () => {
      const wrapper = mountDateInput();
      const yearInput = wrapper.find('.ymd-year');
      await yearInput.setValue('1900');
      // The input event triggers emit
      await yearInput.trigger('input');
      const emitted = wrapper.emitted('update:dateValue');
      expect(emitted).toBeTruthy();
      // Last emission should be year-only
      const lastValue = emitted![emitted!.length - 1][0];
      expect(lastValue).toBe('1900');
    });

    it('emits full date when all parts present', async () => {
      const wrapper = mountDateInput({ dateValue: '1900-06' });
      const dayInput = wrapper.findAll('.ymd-day')[0];
      (dayInput.element as HTMLInputElement).value = '15';
      await dayInput.trigger('input');
      const emitted = wrapper.emitted('update:dateValue')!;
      const lastValue = emitted[emitted.length - 1][0];
      expect(lastValue).toBe('1900-06-15');
    });
  });

  describe('digit filtering', () => {
    it('strips non-digit characters from year input', async () => {
      const wrapper = mountDateInput();
      const yearInput = wrapper.find('.ymd-year');
      (yearInput.element as HTMLInputElement).value = '19ab';
      await yearInput.trigger('input');
      expect((yearInput.element as HTMLInputElement).value).toBe('19');
    });
  });

  describe('date type', () => {
    it('hides date fields when type is unknown', () => {
      const wrapper = mountDateInput({ dateType: 'unknown' });
      expect(wrapper.findAll('.ymd-group')).toHaveLength(0);
    });

    it('shows end date fields when type is between', () => {
      const wrapper = mountDateInput({ dateType: 'between' });
      const ymdGroups = wrapper.findAll('.ymd-group');
      expect(ymdGroups).toHaveLength(2);
    });

    it('shows only start date for exact type', () => {
      const wrapper = mountDateInput({ dateType: 'exact' });
      const ymdGroups = wrapper.findAll('.ymd-group');
      expect(ymdGroups).toHaveLength(1);
    });

    it('emits dateType change', async () => {
      const wrapper = mountDateInput();
      await wrapper.find('select').setValue('about');
      expect(wrapper.emitted('update:dateType')![0][0]).toBe('about');
    });
  });

  describe('original date', () => {
    it('shows dateOriginal value', () => {
      const wrapper = mountDateInput({ dateOriginal: '1 JAN 1850' });
      const origInput = wrapper.find('.date-original-row input');
      expect((origInput.element as HTMLInputElement).value).toBe('1 JAN 1850');
    });

    it('emits dateOriginal change', async () => {
      const wrapper = mountDateInput();
      const origInput = wrapper.find('.date-original-row input');
      (origInput.element as HTMLInputElement).value = 'circa 1900';
      await origInput.trigger('input');
      expect(wrapper.emitted('update:dateOriginal')![0][0]).toBe('circa 1900');
    });
  });

  describe('between mode end date', () => {
    it('parses dateValueEnd into end fields', () => {
      const wrapper = mountDateInput({
        dateType: 'between',
        dateValue: '1850-01-01',
        dateValueEnd: '1860-12-31',
      });
      const ymdGroups = wrapper.findAll('.ymd-group');
      const endInputs = ymdGroups[1].findAll('input');
      expect((endInputs[0].element as HTMLInputElement).value).toBe('1860');
      expect((endInputs[1].element as HTMLInputElement).value).toBe('12');
      expect((endInputs[2].element as HTMLInputElement).value).toBe('31');
    });

    it('emits update:dateValueEnd when end date changes', async () => {
      const wrapper = mountDateInput({
        dateType: 'between',
        dateValueEnd: '1860',
      });
      const ymdGroups = wrapper.findAll('.ymd-group');
      const endMonthInput = ymdGroups[1].findAll('input')[1];
      (endMonthInput.element as HTMLInputElement).value = '06';
      await endMonthInput.trigger('input');
      const emitted = wrapper.emitted('update:dateValueEnd')!;
      expect(emitted[emitted.length - 1][0]).toBe('1860-06');
    });
  });
});
