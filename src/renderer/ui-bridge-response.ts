/**
 * Helpers for the dev-MCP eval bridge's response leg.
 *
 * `ui_eval_response` serialises its payload as JSON on the way to Rust, so a
 * result the evaluated script produced but JSON cannot encode — a cyclic
 * object, most commonly a vue-router `NavigationFailure`, whose `from` / `to`
 * route records reference each other — makes `invoke` reject.
 *
 * The renderer used to swallow that rejection into a `console.error`. No reply
 * reached Rust, the pending oneshot never fired, and the caller waited out the
 * full `EVAL_TIMEOUT` before being told "renderer script timed out". Nothing
 * had timed out; the response was dropped. That misreport cost a deterministic
 * 15 s stall in the duplicates e2e spec and read as flakiness for months.
 *
 * A dropped reply is never acceptable: the caller cannot distinguish it from a
 * hang. When the real value cannot cross, send a descriptor saying so.
 */

/** Shape the Rust side already understands as a failed eval. */
export interface EvalErrorPayload {
  __error: string;
}

/**
 * Best-effort one-line description of a value that could not be encoded, so
 * the caller learns what came back instead of just that something did not.
 */
export function describeUnserializable(value: unknown): string {
  if (value === null) return 'null';
  const type = typeof value;
  if (type !== 'object' && type !== 'function') return type;

  const ctor = (value as object)?.constructor?.name;
  const parts: string[] = [ctor && ctor !== 'Object' ? ctor : type];

  // vue-router's NavigationFailure is the case that actually bit us: an Error
  // carrying a numeric `type` from NavigationFailureType (16 = duplicated).
  const failureType = (value as { type?: unknown }).type;
  if (typeof failureType === 'number') parts.push(`type=${failureType}`);

  if (value instanceof Error && value.message) parts.push(value.message);

  try {
    const keys = Object.keys(value as object);
    if (keys.length > 0) parts.push(`keys=[${keys.slice(0, 8).join(', ')}]`);
  } catch {
    /* exotic proxy — the description is best-effort */
  }

  return parts.join(' ');
}

/**
 * Encode an eval result for the response leg.
 *
 * Returns the value unchanged when JSON can carry it, and an
 * `{ __error }` descriptor when it cannot. Callers get an answer either way.
 */
export function encodeEvalResult(value: unknown): unknown | EvalErrorPayload {
  try {
    JSON.stringify(value);
    return value;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return {
      __error:
        `eval result is not serializable (${reason}): ${describeUnserializable(value)}. ` +
        `Have the script return a projection of the value instead — e.g. ` +
        `\`await p.then(r => r ? String(r.type) : null)\` rather than \`await p\`.`,
    };
  }
}
