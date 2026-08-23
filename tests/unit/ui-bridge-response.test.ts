import { describe, it, expect } from 'vitest';
import { encodeEvalResult, describeUnserializable } from '../../src/renderer/ui-bridge-response';

/**
 * The dev-MCP eval bridge JSON-encodes its response payload. A result JSON
 * cannot carry used to make `invoke` reject, the renderer swallowed the
 * rejection, and no reply reached Rust — so the caller waited out the 15 s
 * EVAL_TIMEOUT and was told "renderer script timed out" although nothing had.
 *
 * The contract these pin: every value produces something sendable.
 */
describe('encodeEvalResult', () => {
  it('passes JSON-encodable values through untouched', () => {
    for (const v of [null, 42, 'text', true, { a: 1, b: [1, 2] }, [1, 'two']]) {
      expect(encodeEvalResult(v)).toBe(v);
    }
  });

  it('substitutes a descriptor for a cyclic object instead of throwing', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    const encoded = encodeEvalResult(a) as { __error?: string };

    expect(encoded.__error, 'no descriptor produced').toBeTypeOf('string');
    expect(encoded.__error).toMatch(/serializ/i);
    // Whatever comes back must itself be sendable, or the fix moves the hang.
    expect(() => JSON.stringify(encoded)).not.toThrow();
  });

  it('names a vue-router NavigationFailure by its failure type', () => {
    // Shape of the real thing: an Error whose from/to route records are cyclic
    // and whose `type` is NavigationFailureType (16 = duplicated).
    const failure = Object.assign(new Error('Avoided redundant navigation'), { type: 16 }) as
      Error & { type: number; from?: unknown; to?: unknown };
    const from: Record<string, unknown> = { path: '/duplicates' };
    from.matched = [{ instances: { default: from } }];
    failure.from = from;
    failure.to = from;

    const encoded = encodeEvalResult(failure) as { __error?: string };
    expect(encoded.__error).toContain('type=16');
    expect(() => JSON.stringify(encoded)).not.toThrow();
  });

  it('suggests returning a projection so the caller knows the way out', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect((encodeEvalResult(a) as { __error: string }).__error).toMatch(/projection/i);
  });
});

describe('describeUnserializable', () => {
  it('reports primitives by type and null by name', () => {
    expect(describeUnserializable(null)).toBe('null');
    expect(describeUnserializable(7)).toBe('number');
    expect(describeUnserializable(undefined)).toBe('undefined');
  });

  it('reports a constructor name and keys for a plain-ish object', () => {
    class Widget { a = 1; b = 2; }
    const d = describeUnserializable(new Widget());
    expect(d).toContain('Widget');
    expect(d).toContain('a');
  });

  it('includes an Error message', () => {
    expect(describeUnserializable(new Error('boom'))).toContain('boom');
  });

  it('survives a throwing proxy rather than masking the original failure', () => {
    const hostile = new Proxy({}, {
      ownKeys() { throw new Error('no keys for you'); },
    });
    expect(() => describeUnserializable(hostile)).not.toThrow();
  });
});
