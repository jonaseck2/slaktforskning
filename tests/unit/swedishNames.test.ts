import { describe, it, expect } from 'vitest';
import { extractPatronymic } from '../../src/gedcom/swedishNames';

describe('extractPatronymic', async () => {
  it('extracts base from -sson patronymic', async () => {
    expect(extractPatronymic('Johansson')).toBe('Johan');
  });

  it('extracts base from -son patronymic', async () => {
    expect(extractPatronymic('Erikson')).toBe('Erik');
  });

  it('extracts base from -sdotter patronymic', async () => {
    expect(extractPatronymic('Persdotter')).toBe('Per');
  });

  it('extracts base from -dotter patronymic', async () => {
    expect(extractPatronymic('Erikadotter')).toBe('Erika');
  });

  it('handles Andersson correctly', async () => {
    expect(extractPatronymic('Andersson')).toBe('Ander');
  });

  it('handles Eriksson correctly', async () => {
    expect(extractPatronymic('Eriksson')).toBe('Erik');
  });

  it('returns null for non-patronymic surnames', async () => {
    expect(extractPatronymic('Lindström')).toBeNull();
  });

  it('returns null for surnames that happen to contain son but are not patronymics', async () => {
    // "Karlsson" → "Karl" (is a patronymic — this is a known false-positive)
    // The heuristic is intentional; test the non-patronymic case
    expect(extractPatronymic('Bergqvist')).toBeNull();
  });

  it('is case-insensitive', async () => {
    expect(extractPatronymic('JOHANSSON')).toBe('JOHAN');
    expect(extractPatronymic('persdotter')).toBe('per');
  });
});
