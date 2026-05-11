import { undoManager } from '../../api/undo';
import { defineChannel } from './registry';

// ── Undo (worker — undoManager lives in the worker thread) ───────────────────
// undo:undo and undo:redo remain in ipc/database.ts because they also need to
// broadcast undo:changed to all BrowserWindows after the worker call.
// The registry pattern doesn't support post-call Electron broadcasts.

defineChannel({
  name: 'undo:state',
  thread: 'worker',
  handler: async (_db) => await undoManager.getState(),
});

defineChannel({
  name: 'undo:beginGroup',
  thread: 'worker',
  handler: async (_db, label: string) => { await undoManager.beginGroup(label); },
});

defineChannel({
  name: 'undo:endGroup',
  thread: 'worker',
  handler: async (_db) => { await undoManager.endGroup(); },
});
