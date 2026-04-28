import type { ChannelDef, ChannelRegistry, WorkerChannelDef, MainChannelDef } from './types';

const registry: Record<string, ChannelDef> = {};

export function defineChannel<Args extends unknown[], Result>(
  def: WorkerChannelDef<Args, Result>
): WorkerChannelDef<Args, Result>;
export function defineChannel<Args extends unknown[], Result>(
  def: MainChannelDef<Args, Result>
): MainChannelDef<Args, Result>;
export function defineChannel<Args extends unknown[], Result>(
  def: ChannelDef<Args, Result>
): ChannelDef<Args, Result> {
  if (registry[def.name]) {
    throw new Error(`Channel "${def.name}" already registered`);
  }
  registry[def.name] = def as ChannelDef;
  return def;
}

export const channelRegistry: ChannelRegistry = new Proxy(registry, {
  set() { throw new Error('channelRegistry is immutable; use defineChannel'); },
  deleteProperty() { throw new Error('channelRegistry is immutable; use defineChannel'); },
});

export function listChannels(): string[] {
  return Object.keys(registry);
}

export function getChannel(name: string): ChannelDef | undefined {
  return registry[name];
}
