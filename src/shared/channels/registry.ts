import type { ChannelDef } from './types';

const registry: Record<string, ChannelDef> = {};

export function defineChannel<Args extends unknown[], Result>(
  def: ChannelDef<Args, Result>
): ChannelDef<Args, Result> {
  if (registry[def.name]) {
    throw new Error(`Channel "${def.name}" already registered`);
  }
  registry[def.name] = def as ChannelDef;
  return def;
}

export const channelRegistry: Readonly<Record<string, ChannelDef>> = registry;

export function listChannels(): string[] {
  return Object.keys(registry);
}

export function getChannel(name: string): ChannelDef | undefined {
  return registry[name];
}
