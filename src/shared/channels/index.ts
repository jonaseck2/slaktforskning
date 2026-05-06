// Barrel: importing this module registers every domain's channels.
// Future domain migrations should add ONE line here, not edit four files.
import './persons';
import './places';
import './events';
import './sources';
import './relationships';
import './groups';
import './repositories';
import './research-tasks';
import './reports';
import './media';
import './gazetteers';
import './database';
import './undo';
import './import';
export { defineChannel, channelRegistry, listChannels, getChannel } from './registry';
export type { ChannelDef, WorkerChannelDef, MainChannelDef, ThreadMode, ChannelRegistry } from './types';
