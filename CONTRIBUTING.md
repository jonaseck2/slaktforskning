# Contributing to Släktforskning

Thank you for your interest in contributing to Släktforskning!

## Getting Started

See [DEVELOPING.md](DEVELOPING.md) for setup, build commands, dev container usage, and how to run tests.

Before committing, always run:

```bash
npm run lint          # must pass with zero errors
npm test              # unit tests must pass
```

## Development Workflow

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the patterns in `CLAUDE.md`.

3. **Write tests** for new features and regression tests for bug fixes.

4. **Run checks before committing**:
   ```bash
   npm run lint && npm test
   ```

5. **Commit with a clear message** (see Commit Messages below).

6. **Version bump**: Update `package.json` version:
   - Patch (`x.y.Z`) for bug fixes
   - Minor (`x.Y.0`) for new features
   - Only bump when the feature or fix is complete and tested

7. **Open a Pull Request** against `main`.

## Commit Messages

- Use **imperative mood**: "add feature" not "added feature"
- Start with a **type prefix**: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`

Examples:
```
feat: add place gazetteer resolver
fix: correct event date parsing for partial years
docs: update API reference
```

## Code of Conduct

This project adheres to the Contributor Covenant 2.1. See `CODE_OF_CONDUCT.md` for details.

## Questions?

- Open a GitHub issue for bug reports or feature requests
- See [DEVELOPING.md](DEVELOPING.md) for architecture and dev setup
- See `docs/` for design docs and implementation guides
