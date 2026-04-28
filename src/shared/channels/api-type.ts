import type { ChannelDef, WorkerChannelDef } from './types';

type ChannelClient<C extends ChannelDef> =
  C extends WorkerChannelDef<infer Args, infer Result>
    ? (...args: Args) => Promise<Awaited<Result>>
    : C extends { thread: 'main'; handler: (...args: infer Args) => infer Result }
      ? (...args: Args) => Promise<Awaited<Result>>
      : never;

type UnionToIntersection<U> =
  (U extends unknown ? (u: U) => void : never) extends (i: infer I) => void ? I : never;

export type ApiSurface<Reg extends Record<string, ChannelDef>> =
  UnionToIntersection<
    {
      [K in keyof Reg]: K extends `${infer D}:${infer M}`
        ? { [P in D]: { [Q in M]: ChannelClient<Reg[K]> } }
        : never;
    }[keyof Reg]
  >;
