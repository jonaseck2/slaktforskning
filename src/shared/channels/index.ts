// Barrel: importing this module registers every domain's channels.
// Future domain migrations should add ONE line here, not edit four files.
import './persons';
// import './places';   // added in Task 4
// import './events';   // added in Task 5
// (etc.)
export { defineChannel, channelRegistry, listChannels, getChannel } from './registry';
export type { ChannelDef, WorkerChannelDef, MainChannelDef, ThreadMode, ChannelRegistry } from './types';
