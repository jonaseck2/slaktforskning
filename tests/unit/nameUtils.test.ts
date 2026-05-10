import { describe, it, expect } from 'vitest';
import { fullNameParts, givenNameParts, parseAsteriskNotation, getDisplayName, chartNameParts, formatChartName, formatFullNameWithBirthName, pickBirthSurnameForDisplay, type NameData } from '../../src/renderer/utils/nameUtils';

describe('givenNameParts', async () => {
  it('marks preferred name token for underline', async () => {
    const parts = givenNameParts('Eva Linda Marie', 'Linda');
    expect(parts.find(p => p.text === 'Linda')?.underline).toBe(true);
    expect(parts.find(p => p.text === 'Eva')?.underline).toBe(false);
  });
});

describe('fullNameParts', async () => {
  it('renders surname without nickname', async () => {
    const parts = fullNameParts('Anna', 'Johansson', null);
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna Johansson');
  });

  it('inserts nickname right after the preferred name token', async () => {
    // Elisabeth* Cathrina with nickname Lisa → Elisabeth "Lisa" Cathrina
    const parts = fullNameParts('Elisabeth Cathrina', null, 'Elisabeth', 'Lisa');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Elisabeth "Lisa" Cathrina');
    expect(parts.find(p => p.text === 'Elisabeth')?.underline).toBe(true);
  });

  it('inserts nickname after preferred token with surname', async () => {
    const parts = fullNameParts('Elisabeth Cathrina', 'Svensson', 'Elisabeth', 'Lisa');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Elisabeth "Lisa" Cathrina Svensson');
  });

  it('inserts nickname after preferred token mid-name', async () => {
    const parts = fullNameParts('Anna Susanna Kristina', 'Johansson', 'Susanna', 'Sanna');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna Susanna "Sanna" Kristina Johansson');
    expect(parts.find(p => p.text === 'Susanna')?.underline).toBe(true);
  });

  it('falls back to nickname after all given names when no preferred name', async () => {
    const parts = fullNameParts('Anna', null, null, 'Nanna');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna "Nanna"');
  });

  it('falls back to nickname before surname when no preferred name', async () => {
    const parts = fullNameParts('Susanna', 'Johansson', null, 'Sanna');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Susanna "Sanna" Johansson');
  });

  it('omits nickname when null', async () => {
    const parts = fullNameParts('Anna', 'Johansson', null, null);
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna Johansson');
  });
});

describe('getDisplayName', async () => {
  it('returns null for empty array', async () => {
    expect(getDisplayName([])).toBeNull();
  });

  it('returns the only element when array has one item', async () => {
    const names = [{ sort_order: 0, given_name: 'Anna' }];
    expect(getDisplayName(names)).toBe(names[0]);
  });

  it('returns the name with the highest sort_order (most recent)', async () => {
    const birth = { sort_order: 0, given_name: 'Anna', surname: 'Lindqvist' };
    const married = { sort_order: 1, given_name: 'Anna', surname: 'Persson' };
    expect(getDisplayName([birth, married])).toBe(married);
  });

  it('does not mutate the input array', async () => {
    const names = [
      { sort_order: 2, given_name: 'C' },
      { sort_order: 0, given_name: 'A' },
      { sort_order: 1, given_name: 'B' },
    ];
    const copy = [...names];
    getDisplayName(names);
    expect(names).toEqual(copy);
  });
});

describe('chartNameParts', async () => {
  it('shows preferred_name + surname with underline on preferred token', async () => {
    const parts = chartNameParts('Bengt Gunnar', 'Persson', 'Gunnar');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Gunnar Persson');
    expect(parts.find(p => p.text === 'Gunnar')?.underline).toBe(true);
    expect(parts.find(p => p.text === 'Persson')?.underline).toBe(false);
  });

  it('falls back to first given name token when no preferred_name', async () => {
    const parts = chartNameParts('Anna Maria', 'Holm', null);
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Anna Holm');
    expect(parts.find(p => p.text === 'Anna')?.underline).toBe(false);
  });

  it('handles null given name', async () => {
    const parts = chartNameParts(null, 'Svensson', null);
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Svensson');
  });

  it('handles null surname', async () => {
    const parts = chartNameParts('Lars Erik', null, 'Erik');
    const text = parts.map(p => p.text).join('');
    expect(text).toBe('Erik');
    expect(parts.find(p => p.text === 'Erik')?.underline).toBe(true);
  });

  it('returns empty array for all-null inputs', async () => {
    expect(chartNameParts(null, null, null)).toEqual([]);
  });
});

describe('formatChartName', async () => {
  it('uses preferred_name over first given name token', async () => {
    expect(formatChartName({ given_name: 'Bengt Gunnar', surname: 'Persson', preferred_name: 'Gunnar' }))
      .toBe('Gunnar Persson');
  });

  it('falls back to first given name token when no preferred_name', async () => {
    expect(formatChartName({ given_name: 'Anna Maria', surname: 'Holm', preferred_name: null }))
      .toBe('Anna Holm');
  });

  it('handles missing surname', async () => {
    expect(formatChartName({ given_name: 'Lars', surname: null, preferred_name: null }))
      .toBe('Lars');
  });

  it('handles missing given name', async () => {
    expect(formatChartName({ given_name: null, surname: 'Eriksson', preferred_name: null }))
      .toBe('Eriksson');
  });
});

describe('parseAsteriskNotation', async () => {
  it('extracts preferred name from asterisk notation', async () => {
    const result = parseAsteriskNotation('Elisabeth* Cathrina');
    expect(result.given_name).toBe('Elisabeth Cathrina');
    expect(result.preferred_name).toBe('Elisabeth');
  });

  it('extracts middle-name asterisk', async () => {
    const result = parseAsteriskNotation('Eva Linda* Marie');
    expect(result.given_name).toBe('Eva Linda Marie');
    expect(result.preferred_name).toBe('Linda');
  });

  it('extracts first-token asterisk', async () => {
    const result = parseAsteriskNotation('Lars* Erik');
    expect(result.given_name).toBe('Lars Erik');
    expect(result.preferred_name).toBe('Lars');
  });

  it('returns null preferred_name when no asterisk', async () => {
    const result = parseAsteriskNotation('Anna Maria');
    expect(result.given_name).toBe('Anna Maria');
    expect(result.preferred_name).toBeNull();
  });

  it('trims whitespace', async () => {
    const result = parseAsteriskNotation('  Anna*  Maria  ');
    expect(result.given_name).toBe('Anna Maria');
    expect(result.preferred_name).toBe('Anna');
  });

  it('extracts preferred name from exclamation mark notation', async () => {
    const result = parseAsteriskNotation('Elisabeth! Cathrina');
    expect(result.given_name).toBe('Elisabeth Cathrina');
    expect(result.preferred_name).toBe('Elisabeth');
  });

  it('extracts middle-name exclamation mark', async () => {
    const result = parseAsteriskNotation('Eva Linda! Marie');
    expect(result.given_name).toBe('Eva Linda Marie');
    expect(result.preferred_name).toBe('Linda');
  });
});

describe('formatFullNameWithBirthName', async () => {
  function mkName(overrides: Partial<NameData>): NameData {
    return {
      id: 'name-1',
      given_name: null,
      surname: null,
      preferred_name: null,
      nickname: null,
      sort_order: 0,
      name_type: 'birth',
      ...overrides,
    };
  }

  const married = mkName({
    id: 'married-1',
    given_name: 'Anna',
    surname: 'Andersson',
    sort_order: 1,
    name_type: 'married',
  });
  const birth = mkName({
    id: 'birth-1',
    given_name: 'Anna',
    surname: 'Svensson',
    sort_order: 0,
    name_type: 'birth',
  });

  it('1. toggle off → no parenthetical', async () => {
    const out = formatFullNameWithBirthName(married, [married, birth], { showBirthNameParenthetical: false, bornAbbrev: 'f.' });
    expect(out).toBe('Anna Andersson');
  });

  it('2. same surname → no parenthetical', async () => {
    const sameSurnameBirth = mkName({ id: 'birth-2', given_name: 'Anna', surname: 'Andersson', sort_order: 0, name_type: 'birth' });
    const out = formatFullNameWithBirthName(married, [married, sameSurnameBirth], { showBirthNameParenthetical: true, bornAbbrev: 'f.' });
    expect(out).toBe('Anna Andersson');
  });

  it('3. different surname + toggle on → parenthetical present (sv)', async () => {
    const out = formatFullNameWithBirthName(married, [married, birth], { showBirthNameParenthetical: true, bornAbbrev: 'f.' });
    expect(out).toBe('Anna Andersson (f. Svensson)');
  });

  it('4. no birth record → no parenthetical', async () => {
    const aliasOnly = mkName({ id: 'alias-1', given_name: 'Anna', surname: 'Andersson', sort_order: 1, name_type: 'alias' });
    const out = formatFullNameWithBirthName(married, [married, aliasOnly], { showBirthNameParenthetical: true, bornAbbrev: 'f.' });
    expect(out).toBe('Anna Andersson');
  });

  it('5. displayed name IS the birth name → no parenthetical', async () => {
    const out = formatFullNameWithBirthName(birth, [birth, married], { showBirthNameParenthetical: true, bornAbbrev: 'f.' });
    expect(out).toBe('Anna Svensson');
  });

  it('6. bornAbbrev "b." → English form', async () => {
    const out = formatFullNameWithBirthName(married, [married, birth], { showBirthNameParenthetical: true, bornAbbrev: 'b.' });
    expect(out).toBe('Anna Andersson (b. Svensson)');
  });

  it('7. empty birth surname → no parenthetical', async () => {
    const emptyBirth = mkName({ id: 'birth-3', given_name: 'Anna', surname: '', sort_order: 0, name_type: 'birth' });
    const out = formatFullNameWithBirthName(married, [married, emptyBirth], { showBirthNameParenthetical: true, bornAbbrev: 'f.' });
    expect(out).toBe('Anna Andersson');
  });

  it('8. multiple birth records → uses lowest sort_order', async () => {
    const birthLow = mkName({ id: 'birth-low', given_name: 'Anna', surname: 'Svensson', sort_order: 0, name_type: 'birth' });
    const birthHigh = mkName({ id: 'birth-high', given_name: 'Anna', surname: 'Karlsson', sort_order: 5, name_type: 'birth' });
    const out = formatFullNameWithBirthName(married, [married, birthHigh, birthLow], { showBirthNameParenthetical: true, bornAbbrev: 'f.' });
    expect(out).toBe('Anna Andersson (f. Svensson)');
  });
});

describe('pickBirthSurnameForDisplay', async () => {
  function mkName(overrides: Partial<NameData>): NameData {
    return {
      id: 'name-1',
      given_name: null,
      surname: null,
      preferred_name: null,
      nickname: null,
      sort_order: 0,
      name_type: 'birth',
      ...overrides,
    };
  }

  const married = mkName({
    id: 'married-1',
    given_name: 'Anna',
    surname: 'Andersson',
    sort_order: 1,
    name_type: 'married',
  });
  const birth = mkName({
    id: 'birth-1',
    given_name: 'Anna',
    surname: 'Svensson',
    sort_order: 0,
    name_type: 'birth',
  });

  it('returns null when displayed is null', async () => {
    expect(pickBirthSurnameForDisplay(null, [birth])).toBeNull();
  });

  it('returns null when no birth record exists', async () => {
    const aliasOnly = mkName({ id: 'alias-1', given_name: 'Anna', surname: 'Andersson', sort_order: 1, name_type: 'alias' });
    expect(pickBirthSurnameForDisplay(married, [married, aliasOnly])).toBeNull();
  });

  it('returns null when displayed IS the birth record (matched by id)', async () => {
    expect(pickBirthSurnameForDisplay(birth, [birth, married])).toBeNull();
  });

  it('returns null when birth surname matches displayed surname', async () => {
    const sameSurname = mkName({ id: 'birth-2', given_name: 'Anna', surname: 'Andersson', sort_order: 0, name_type: 'birth' });
    expect(pickBirthSurnameForDisplay(married, [married, sameSurname])).toBeNull();
  });

  it('returns null when birth surname is empty/whitespace', async () => {
    const emptyBirth = mkName({ id: 'birth-3', given_name: 'Anna', surname: '   ', sort_order: 0, name_type: 'birth' });
    expect(pickBirthSurnameForDisplay(married, [married, emptyBirth])).toBeNull();
  });

  it('returns the birth surname when distinct from displayed', async () => {
    expect(pickBirthSurnameForDisplay(married, [married, birth])).toBe('Svensson');
  });

  it('uses lowest sort_order when multiple birth records exist', async () => {
    const birthLow = mkName({ id: 'birth-low', given_name: 'Anna', surname: 'Svensson', sort_order: 0, name_type: 'birth' });
    const birthHigh = mkName({ id: 'birth-high', given_name: 'Anna', surname: 'Karlsson', sort_order: 5, name_type: 'birth' });
    expect(pickBirthSurnameForDisplay(married, [married, birthHigh, birthLow])).toBe('Svensson');
  });

  it('works with a partial displayed shape (no id supplied)', async () => {
    expect(pickBirthSurnameForDisplay({ surname: 'Andersson' }, [birth])).toBe('Svensson');
  });
});
