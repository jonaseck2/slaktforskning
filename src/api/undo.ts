/**
 * Command-pattern undo/redo manager.
 * Lives in main process alongside the database.
 * In-memory only — stacks reset on app restart or DB switch.
 */

export interface UndoAction {
  label: string;
  undo: () => void;
  redo: () => void;
}

export class UndoManager {
  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];
  private maxDepth = 100;
  private groupStack: UndoAction[][] | null = null;
  private groupLabel: string | null = null;

  push(action: UndoAction): void {
    if (this.groupStack !== null) {
      this.groupStack.push(action);
      return;
    }
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    // New action invalidates redo stack
    this.redoStack.length = 0;
  }

  undo(): string | null {
    const action = this.undoStack.pop();
    if (!action) return null;
    action.undo();
    this.redoStack.push(action);
    return action.label;
  }

  redo(): string | null {
    const action = this.redoStack.pop();
    if (!action) return null;
    action.redo();
    this.undoStack.push(action);
    return action.label;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getUndoLabel(): string | null {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].label : null;
  }

  getRedoLabel(): string | null {
    return this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1].label : null;
  }

  beginGroup(label: string): void {
    this.groupStack = [];
    this.groupLabel = label;
  }

  endGroup(): void {
    if (this.groupStack === null) return;
    const actions = this.groupStack;
    const label = this.groupLabel!;
    this.groupStack = null;
    this.groupLabel = null;

    if (actions.length === 0) return;

    // Combine all grouped actions into a single undo step
    this.push({
      label,
      undo: () => {
        // Undo in reverse order
        for (let i = actions.length - 1; i >= 0; i--) {
          actions[i].undo();
        }
      },
      redo: () => {
        for (const action of actions) {
          action.redo();
        }
      },
    });
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.groupStack = null;
    this.groupLabel = null;
  }

  getState(): { canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null } {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoLabel: this.getUndoLabel(),
      redoLabel: this.getRedoLabel(),
    };
  }
}

export const undoManager = new UndoManager();
