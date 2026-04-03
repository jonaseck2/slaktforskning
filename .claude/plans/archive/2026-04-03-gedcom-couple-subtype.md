# Fix: GEDCOM import — couple subtype always 'unknown'

## Problem

After importing a Genney GEDCOM file, married couples showed up with
`subtype: 'unknown'` instead of `subtype: 'marriage'`. The spouse relationship
existed but the marriage type was lost.

## Root Cause

`src/gedcom/importer.ts` created every FAM record as a couple with
`subtype: 'unknown'` and only upgraded the subtype if a `_SUBTYPE` child tag
was present. `_SUBTYPE` is a custom tag emitted only by this app's own extended
GEDCOM exporter (v0.6.4). Standard GEDCOM files — including Genney exports —
never contain `_SUBTYPE`, so every imported couple ended up as `'unknown'`.

In standard GEDCOM 5.5.1 there is no explicit "couple type" field. Marriage is
indicated by the presence of a `MARR` event record under the `FAM` record.

## Fix

Before creating the relationship, check `getChildren(node, 'MARR').length > 0`.
If a `MARR` event exists in the FAM, use `subtype: 'marriage'`; otherwise fall
back to `'unknown'`. The extended `_SUBTYPE` tag still takes precedence when
present (for extended roundtrip fidelity).

```
extSubtype = getChild(node, '_SUBTYPE')?.value;
hasMarr    = getChildren(node, 'MARR').length > 0;
subtype    = extSubtype ?? (hasMarr ? 'marriage' : 'unknown');
```

## Files Changed

- `src/gedcom/importer.ts` — infer couple subtype from MARR presence
- `tests/unit/gedcom.test.ts` — assert subtype='marriage' on MARR import; new test for no-MARR → 'unknown'
