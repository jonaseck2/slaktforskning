// Public dedup API. Each entity file owns its own scorer/merge logic.
// New entity dedup → create src/api/duplicates/<entity>.ts, add one
// `export * from './<entity>'` line below. Anything imported via
// `from '../api/duplicates'` flows through this barrel.
export * from './persons';
export * from './places';
export * from './sources';
export * from './media';
export * from './shared';
export * from './clusters';
export * from './consolidate';
