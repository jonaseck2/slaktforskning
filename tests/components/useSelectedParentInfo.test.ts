import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useSelectedParentInfo } from '../../src/renderer/composables/useSelectedParentInfo';

/**
 * Flush all pending microtasks / Vue watchers by yielding several ticks.
 * The composable's watch callback contains two sequential awaits
 * (getForPerson + Promise.all(persons.get)), so we need multiple ticks to settle.
 */
async function flush(n = 8) {
  for (let i = 0; i < n; i++) await nextTick();
}

// Stub window.api before each test
const mockGetForPerson = vi.fn();
const mockPersonGet = vi.fn();

beforeEach(() => {
  mockGetForPerson.mockReset();
  mockPersonGet.mockReset();

  Object.defineProperty(window, 'api', {
    value: {
      relationships: {
        getForPerson: mockGetForPerson,
      },
      persons: {
        get: mockPersonGet,
      },
    },
    writable: true,
    configurable: true,
  });
});

// Helpers to build relationship rows
function parentChildRel(parentId: string, childId: string) {
  return { type: 'parent_child', person1_id: parentId, person2_id: childId };
}

function coupleRel(p1: string, p2: string) {
  return { type: 'couple', person1_id: p1, person2_id: p2 };
}

describe('useSelectedParentInfo — null / undefined id', async () => {
  it('starts as null when id is null', async () => {
    const id = ref<string | null>(null);
    mockGetForPerson.mockResolvedValue([]);
    const info = useSelectedParentInfo(id);
    await nextTick();
    expect(info.value).toBeNull();
    expect(mockGetForPerson).not.toHaveBeenCalled();
  });

  it('starts as null when id is undefined', async () => {
    const id = ref<string | undefined>(undefined);
    mockGetForPerson.mockResolvedValue([]);
    const info = useSelectedParentInfo(id);
    await nextTick();
    expect(info.value).toBeNull();
    expect(mockGetForPerson).not.toHaveBeenCalled();
  });

  it('resets to null when id becomes null after being set', async () => {
    const id = ref<string | null>('p1');
    mockGetForPerson.mockResolvedValue([]);
    const info = useSelectedParentInfo(id);
    await flush();
    // No parents → should have settled to { hasFather: false, hasMother: false }
    expect(info.value).not.toBeNull();

    id.value = null;
    await nextTick();
    expect(info.value).toBeNull();
    expect(mockGetForPerson).toHaveBeenCalledTimes(1);
  });
});

describe('useSelectedParentInfo — no parents', async () => {
  it('returns hasFather: false, hasMother: false when no parent_child rels exist', async () => {
    const id = ref<string | null>('child1');
    mockGetForPerson.mockResolvedValue([
      coupleRel('spouse1', 'child1'), // not parent_child
    ]);
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toEqual({ hasFather: false, hasMother: false });
    expect(mockPersonGet).not.toHaveBeenCalled();
  });

  it('returns hasFather: false, hasMother: false when rels list is empty', async () => {
    const id = ref<string | null>('child2');
    mockGetForPerson.mockResolvedValue([]);
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toEqual({ hasFather: false, hasMother: false });
    expect(mockPersonGet).not.toHaveBeenCalled();
  });

  it('ignores parent_child rows where person is person1 (parent side)', async () => {
    // This person is the PARENT in this row (person1_id === id), not the child
    const id = ref<string | null>('parent1');
    mockGetForPerson.mockResolvedValue([
      parentChildRel('parent1', 'child1'), // parent1 is person1 → they are a parent, not a child
    ]);
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toEqual({ hasFather: false, hasMother: false });
    expect(mockPersonGet).not.toHaveBeenCalled();
  });
});

describe('useSelectedParentInfo — with one father', async () => {
  it('returns hasFather: true, hasMother: false with a male parent', async () => {
    const id = ref<string | null>('child3');
    mockGetForPerson.mockResolvedValue([
      parentChildRel('father1', 'child3'),
    ]);
    mockPersonGet.mockResolvedValue({ id: 'father1', sex: 'M' });
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toEqual({ hasFather: true, hasMother: false });
    expect(mockPersonGet).toHaveBeenCalledWith('father1');
  });
});

describe('useSelectedParentInfo — with one mother', async () => {
  it('returns hasFather: false, hasMother: true with a female parent', async () => {
    const id = ref<string | null>('child4');
    mockGetForPerson.mockResolvedValue([
      parentChildRel('mother1', 'child4'),
    ]);
    mockPersonGet.mockResolvedValue({ id: 'mother1', sex: 'F' });
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toEqual({ hasFather: false, hasMother: true });
    expect(mockPersonGet).toHaveBeenCalledWith('mother1');
  });
});

describe('useSelectedParentInfo — with both parents', async () => {
  it('returns hasFather: true, hasMother: true with male and female parents', async () => {
    const id = ref<string | null>('child5');
    mockGetForPerson.mockResolvedValue([
      parentChildRel('father2', 'child5'),
      parentChildRel('mother2', 'child5'),
    ]);
    mockPersonGet.mockImplementation(async (pid: string) => {
      if (pid === 'father2') return { id: 'father2', sex: 'M' };
      if (pid === 'mother2') return { id: 'mother2', sex: 'F' };
      return null;
    });
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toEqual({ hasFather: true, hasMother: true });
    expect(mockPersonGet).toHaveBeenCalledTimes(2);
  });

  it('returns hasFather: false, hasMother: false when both parents return null', async () => {
    const id = ref<string | null>('child6');
    mockGetForPerson.mockResolvedValue([
      parentChildRel('unknown1', 'child6'),
      parentChildRel('unknown2', 'child6'),
    ]);
    mockPersonGet.mockResolvedValue(null);
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toEqual({ hasFather: false, hasMother: false });
  });

  it('handles parent with no sex field (sex is undefined)', async () => {
    const id = ref<string | null>('child7');
    mockGetForPerson.mockResolvedValue([
      parentChildRel('parent_nosex', 'child7'),
    ]);
    mockPersonGet.mockResolvedValue({ id: 'parent_nosex' }); // no sex field
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toEqual({ hasFather: false, hasMother: false });
  });
});

describe('useSelectedParentInfo — reactivity on id change', async () => {
  it('re-fetches when id changes to a new person', async () => {
    const id = ref<string | null>('p1');
    mockGetForPerson.mockResolvedValue([]);
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toEqual({ hasFather: false, hasMother: false });
    expect(mockGetForPerson).toHaveBeenCalledWith('p1');

    // Change to a person with a father
    mockGetForPerson.mockResolvedValue([parentChildRel('dad', 'p2')]);
    mockPersonGet.mockResolvedValue({ id: 'dad', sex: 'M' });
    id.value = 'p2';
    await flush();
    expect(mockGetForPerson).toHaveBeenCalledWith('p2');
    expect(info.value).toEqual({ hasFather: true, hasMother: false });
  });
});

describe('useSelectedParentInfo — error handling', async () => {
  it('sets info to null when getForPerson throws', async () => {
    const id = ref<string | null>('errChild');
    mockGetForPerson.mockRejectedValue(new Error('network error'));
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toBeNull();
  });

  it('sets info to null when persons.get throws', async () => {
    const id = ref<string | null>('errChild2');
    mockGetForPerson.mockResolvedValue([parentChildRel('badParent', 'errChild2')]);
    mockPersonGet.mockRejectedValue(new Error('db error'));
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toBeNull();
  });
});

describe('useSelectedParentInfo — parent_child row with null person1_id', async () => {
  it('filters out parent_child rows where person1_id is null', async () => {
    const id = ref<string | null>('child8');
    mockGetForPerson.mockResolvedValue([
      { type: 'parent_child', person1_id: null, person2_id: 'child8' },
    ]);
    // parentIds will be empty after the null filter → falls into the "no parents" branch
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toEqual({ hasFather: false, hasMother: false });
    expect(mockPersonGet).not.toHaveBeenCalled();
  });
});

describe('useSelectedParentInfo — mixed sex in parent list', async () => {
  it('hasFather true, hasMother false when multiple male parents and no female', async () => {
    const id = ref<string | null>('child9');
    mockGetForPerson.mockResolvedValue([
      parentChildRel('dad1', 'child9'),
      parentChildRel('dad2', 'child9'),
    ]);
    mockPersonGet.mockResolvedValue({ sex: 'M' });
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toEqual({ hasFather: true, hasMother: false });
  });

  it('hasFather false, hasMother true when multiple female parents and no male', async () => {
    const id = ref<string | null>('child10');
    mockGetForPerson.mockResolvedValue([
      parentChildRel('mom1', 'child10'),
      parentChildRel('mom2', 'child10'),
    ]);
    mockPersonGet.mockResolvedValue({ sex: 'F' });
    const info = useSelectedParentInfo(id);
    await flush();
    expect(info.value).toEqual({ hasFather: false, hasMother: true });
  });
});
