# Lint Discipline

Loads always. Every commit leaves `npm run lint` at zero errors and zero warnings.

## The rule

- `npm run lint` fails on any warning. The script passes `--max-warnings 0`, and CI runs the same script.
- A warning in a file the commit did not change is still the committer's to fix when `npm run lint` is red. Fix it in a separate commit first.
- Fix at the source. Remove the unused import or variable. Prefix an argument that must stay with `_`. Run `npm run lint -- --fix` for `import/order`.
- The only allowed suppression is `// eslint-disable-next-line <rule> -- <reason>` on the flagged line. The reason says why the code cannot change. No file-wide disables.
- Never raise `--max-warnings`. Never turn a `warn` rule off in `.eslintrc.json` to reach green.

## Known legitimate suppression

`import/order` on the `vitest` import in a test that calls `vi.mock` with a factory closing over a `vi.fn()` declared above it. The imports of the mocked module must stay below that declaration, or the factory reads it before it exists. `tests/unit/db-shim.test.ts`, `import-batching.test.ts` and `tauri-window-api.test.ts` carry the comment.

## Why this is a rule

On 2026-11-07 the repo carried 49 warnings in 47 files: 35 `import/order`, 14 `no-unused-vars`. None sat in a file that commit had changed. A warning blocks nothing, so each commit could add one and pass. The count only ever grew.

A rule with no mechanical trigger is optional at the moment it matters (see `evidence.md`). `--max-warnings 0` is the trigger. This file records the reason, so nobody lowers the bar to get a green build.

## Scope

`npm run lint` covers `.ts` and `.tsx`. It does not lint `.vue` files. A `.vue` change still needs the type-check described in the `commit` skill.
