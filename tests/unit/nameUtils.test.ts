import { describe, it, expect } from 'vitest';
import { fullNameParts, givenNameParts } from '../../src/renderer/utils/nameUtils';

describe('givenNameParts', () => {
  it('marks preferred name token for underline', () => {
    const parts = givenNameParts('Eva Linda Marie', 'Linda');
    expect(parts.find(p => p.text === 'Linda')?.underline).toBe(true);
    expect(parts.find(p => p.text === 'Eva')?.underline).toBe(false);
  });
});

describe('fullNameParts', () => {
  it('renders surname without nickname', () => {
    const parts = fullNameParts('Anna', 'Johansson', null);
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna Johansson');
  });

  it('renders nickname in double quotes between given name and surname', () => {
    const parts = fullNameParts('Susanna', 'Johansson', null, 'Sanna');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Susanna "Sanna" Johansson');
  });

  it('renders preferred name underlined and nickname in quotes', () => {
    const parts = fullNameParts('Anna Susanna Kristina', 'Johansson', 'Susanna', 'Sanna');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna Susanna Kristina "Sanna" Johansson');
    expect(parts.find(p => p.text === 'Susanna')?.underline).toBe(true);
  });

  it('renders nickname without surname', () => {
    const parts = fullNameParts('Anna', null, null, 'Nanna');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna "Nanna"');
  });

  it('omits nickname when null', () => {
    const parts = fullNameParts('Anna', 'Johansson', null, null);
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna Johansson');
  });
});
