import type { Database } from 'node-sqlite3-wasm';

export type ThreadMode = 'worker' | 'main';

export type ChannelHandler<Args extends unknown[], Result> =
  | ((db: Database, ...args: Args) => Result | Promise<Result>)  // worker
  | ((...args: Args) => Result | Promise<Result>);              // main

export interface ChannelDef<Args extends unknown[] = unknown[], Result = unknown> {
  readonly name: string;
  readonly thread: ThreadMode;
  readonly handler: ChannelHandler<Args, Result>;
}

export type ChannelRegistry = Readonly<Record<string, ChannelDef>>;
