import type { Database } from 'node-sqlite3-wasm';

export type ThreadMode = 'worker' | 'main';

export type WorkerHandler<Args extends unknown[], Result> =
  (db: Database, ...args: Args) => Result | Promise<Result>;

export type MainHandler<Args extends unknown[], Result> =
  (...args: Args) => Result | Promise<Result>;

interface BaseChannelDef {
  readonly name: string;
  /**
   * If true, the preload wraps the call so that after success it fires
   * `dataChanged` listeners. Read-only channels leave this undefined or false.
   *
   * If you ever need finer-grained broadcasts (e.g. per-domain "persons changed"
   * events), add a separate `broadcasts?: string[]` field rather than overloading
   * this one.
   */
  readonly mutating?: boolean;
}

export interface WorkerChannelDef<Args extends unknown[] = unknown[], Result = unknown>
  extends BaseChannelDef {
  readonly thread: 'worker';
  readonly handler: WorkerHandler<Args, Result>;
}

export interface MainChannelDef<Args extends unknown[] = unknown[], Result = unknown>
  extends BaseChannelDef {
  readonly thread: 'main';
  readonly handler: MainHandler<Args, Result>;
}

export type ChannelDef<Args extends unknown[] = unknown[], Result = unknown> =
  | WorkerChannelDef<Args, Result>
  | MainChannelDef<Args, Result>;

export type ChannelRegistry = Readonly<Record<string, ChannelDef>>;
