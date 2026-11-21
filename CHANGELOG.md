# Changelog

## 4.0.0 — 2026-11-22

A rewrite focused on correctness, speed and developer experience. See
[Migrating from 3.x](./README.md#migrating-from-3x) for the behaviour changes.

### Added

- `explain(value, pattern)` returns `{ valid, errors }` with a path, keys, message and value for every mismatch.
- `assert(value, pattern, message?)` returns the value or throws a `ValidationError` with `.errors`.
- `compile(pattern)` builds a reusable validator with `.explain()` and `.assert()`.
- `type(...names)`: built-in type checks (`string`, `number`, `integer`, `finite`, `boolean`, `bigint`, `symbol`, `function`, `undefined`, `null`, `object`, `array`, `date`, `regexp`, `any`).
- `record(keyPattern, valuePattern)` validates dictionaries.
- `lazy(() => pattern)` supports recursive patterns. Self-referencing pattern objects are also supported.
- `message(pattern, text)` sets custom error messages.
- `forEach(pattern, { min, max })` adds array length bounds.
- `Date` patterns match equal dates, and `NaN` patterns match `NaN`.
- `isPattern(value)` and `ValidationError` are exported.
- Rewritten in TypeScript. **Types are inferred from patterns**: `validate`, `assert` and `compile` narrow values automatically, and `Infer<typeof pattern>` extracts the type. Works with TS ≥ 4.1. Exact literal types need TS ≥ 5.0.

### Fixed

- **ESM import was broken.** `exports["."].import` and `module` pointed to files that weren't published.
- TypeScript declarations described a different API (no `forEach`, wrong signatures) and weren't referenced from `package.json`.
- Objects with an own `constructor` key (common in user-supplied JSON) were rejected as "not plain objects".
- Missing keys could be satisfied by inherited or polluted prototype properties. Only own properties are read now.
- Regexes with the `g` / `y` flags returned alternating results because `lastIndex` persisted.
- `strict()` rejected objects with missing optional (`nullable`) keys, because key counts had to be equal.
- `strict()` wrapping an operator (e.g. `strict(and(...))`) inspected jpv's internal fields as if they were object keys.
- Patterns created by different copies of jpv (CJS + ESM, nested installs) weren't recognised.
- The `license` field (ISC) didn't match the bundled MIT license.

### Performance

- Patterns are compiled into specialised closures, and the boolean path makes no allocations. `validate` is about 2× faster than 3.1.2, and `compile()` about 2.2×. Run `npm run bench` to measure.

### Tooling

- Zero runtime dependencies. Babel and Jest were replaced by `tsc` (the only dev dependency), a small build script and `node:test`.
- Type-level tests (`npm run test:types`).
- `npm run bench` added. CI runs the tests on Node 18–24, smoke-tests the build on Node 14 and 16, and type-checks it with TypeScript 4.1, 4.7, 4.9, 5.0 and latest.

## 3.1.2

- Last 3.x release.
