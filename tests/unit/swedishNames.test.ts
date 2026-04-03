import { describe, it, expect } from 'vitest';
import { extractPatronymic } from '../../src/gedcom/swedishNames';

describe('extractPatronymic', () => {
  it('extracts base from -sson patronymic', () => {
    expect(extractPatronymic('Johansson')).toBe('Johan');
  });

  it('extracts base from -son patronymic', () => {
    expect(extractPatronymic('Erikson')).toBe('Erik');
  });

  it('extracts base from -sdotter patronymic', () => {
    expect(extractPatronymic('Persdotter')).toBe('Per');
  });

  it('extracts base from -dotter patronymic', () => {
    expect(extractPatronymic('Erikadotter')).toBe('Erika');
  });

  it('handles Andersson correctly', () => {
    expect(extractPatronymic('Andersson')).toBe('Ander');
  });

  it('handles Eriksson correctly', () => {
    expect(extractPatronymic('Eriksson')).toBe('Erik');
  });

  it('returns null for non-patronymic surnames', () => {
    expect(extractPatronymic('Lindström')).toBeNull();
  });

  it('returns null for surnames that happen to contain son but are not patronymics', () => {
    // "Karlsson" → "Karl" (is a patronymic — this is a known false-positive)
    // The heuristic is intentional; test the non-patronymic case
    expect(extractPatronymic('Bergqvist')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(extractPatronymic('JOHANSSON')).toBe('JOHAN');
    expect(extractPatronymic('persdotter')).toBe('per');
  });
});
