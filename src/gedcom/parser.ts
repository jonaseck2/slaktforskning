export interface GedcomNode {
  level: number;
  xref: string | null;    // e.g. "@I1@"
  tag: string;            // e.g. "INDI", "NAME"
  value: string;          // e.g. "John /Smith/"
  children: GedcomNode[];
}

export function parseGedcom(text: string): GedcomNode[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const root: GedcomNode[] = [];
  const stack: GedcomNode[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Format: LEVEL [XREF] TAG [VALUE]
    const match = line.match(/^(\d+)\s+(@[^@]+@)?\s*(\w+)\s*(.*)?$/);
    if (!match) continue;

    const level = parseInt(match[1], 10);
    const xref = match[2]?.trim() ?? null;
    const tag = match[3].trim();
    const value = (match[4] ?? '').trim();

    // CONT/CONC must be handled BEFORE popping, while the stack still has context.
    // CONT/CONC at level N always continues the value of the node at level N-1.
    if (tag === 'CONT' || tag === 'CONC') {
      const target = [...stack].reverse().find(n => n.level === level - 1) ?? null;
      if (target) {
        target.value += tag === 'CONT' ? '\n' + value : value;
      }
      continue;
    }

    // Pop stack until we're at the right parent level
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const node: GedcomNode = { level, xref, tag, value, children: [] };

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  return root;
}
