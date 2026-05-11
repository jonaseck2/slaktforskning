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

describe('DateInput', async () => {
  describe('date display', () => {
    it('shows dateValue in the start date field', () => {
      const wrapper = mountDateInput({ dateValue: '1850-03-15' });
      const input = wrapper.find('.date-field .date-text');
      expect((input.element as HTMLInputElement).value).toBe('1850-03-15');
    });

    it('shows year-only date as-is', () => {
      const wrapper = mountDateInput({ dateValue: '1900' });
      const input = wrapper.find('.date-field .date-text');
      expect((input.element as HTMLInputElement).value).toBe('1900');
    });

    it('shows year-month date as-is', () => {
      const wrapper = mountDateInput({ dateValue: '1900-06' });
      const input = wrapper.find('.date-field .date-text');
      expect((input.element as HTMLInputElement).value).toBe('1900-06');
    });

    it('shows empty value when dateValue is empty', () => {
      const wrapper = mountDateInput({ dateValue: '' });
      const input = wrapper.find('.date-field .date-text');
      expect((input.element as HTMLInputElement).value).toBe('');
    });
  });

  describe('text editing (emit)', async () => {
    it('emits year-only when only year entered', async () => {
      const wrapper = mountDateInput();
      const input = wrapper.find('.date-field .date-text');
      (input.element as HTMLInputElement).value = '1900';
      await input.trigger('input');
      const emitted = wrapper.emitted('update:dateValue')!;
      expect(emitted[emitted.length - 1][0]).toBe('1900');
    });

    it('emits full date when complete value typed', async () => {
      const wrapper = mountDateInput({ dateValue: '1900-06' });
      const input = wrapper.find('.date-field .date-text');
      (input.element as HTMLInputElement).value = '1900-06-15';
      await input.trigger('input');
      const emitted = wrapper.emitted('update:dateValue')!;
      expect(emitted[emitted.length - 1][0]).toBe('1900-06-15');
    });
  });

  describe('digit filtering', async () => {
    it('strips non-digit/non-dash characters', async () => {
      const wrapper = mountDateInput();
      const input = wrapper.find('.date-field .date-text');
      (input.element as HTMLInputElement).value = '19ab50';
      await input.trigger('input');
      expect((input.element as HTMLInputElement).value).toBe('1950');
    });
  });

  describe('date type', async () => {
    it('hides date field when type is unknown', () => {
      const wrapper = mountDateInput({ dateType: 'unknown' });
      expect(wrapper.findAll('.date-field')).toHaveLength(0);
    });

    it('shows end date field when type is between', () => {
      const wrapper = mountDateInput({ dateType: 'between' });
      const fields = wrapper.findAll('.date-field');
      expect(fields).toHaveLength(2);
    });

    it('shows only start date for exact type', () => {
      const wrapper = mountDateInput({ dateType: 'exact' });
      const fields = wrapper.findAll('.date-field');
      expect(fields).toHaveLength(1);
    });

    it('emits dateType change', async () => {
      const wrapper = mountDateInput();
      (await wrapper.find('select')).setValue('about');
      expect(wrapper.emitted('update:dateType')![0][0]).toBe('about');
    });
  });

  describe('original date', async () => {
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

  describe('between mode end date', async () => {
    it('shows dateValueEnd in the end field', () => {
      const wrapper = mountDateInput({
        dateType: 'between',
        dateValue: '1850-01-01',
        dateValueEnd: '1860-12-31',
      });
      const fields = wrapper.findAll('.date-field');
      const endInput = fields[1].find('.date-text');
      expect((endInput.element as HTMLInputElement).value).toBe('1860-12-31');
    });

    it('emits update:dateValueEnd when end date changes', async () => {
      const wrapper = mountDateInput({
        dateType: 'between',
        dateValueEnd: '1860',
      });
      const fields = wrapper.findAll('.date-field');
      const endInput = fields[1].find('.date-text');
      (endInput.element as HTMLInputElement).value = '1860-06';
      await endInput.trigger('input');
      const emitted = wrapper.emitted('update:dateValueEnd')!;
      expect(emitted[emitted.length - 1][0]).toBe('1860-06');
    });
  });
});
