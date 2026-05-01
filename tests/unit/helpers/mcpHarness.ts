import type { Database } from 'node-sqlite3-wasm';

type Handler = (args: any) => Promise<{ content: Array<{ type: string; text: string }> }>;

export interface CapturedTool {
  name: string;
  description: string;
  inputSchema: unknown;
  handler: Handler;
}

export function createCaptureServer() {
  const tools = new Map<string, CapturedTool>();
  const server = {
    registerTool(name: string, def: { description: string; inputSchema: unknown }, handler: Handler) {
      tools.set(name, { name, description: def.description, inputSchema: def.inputSchema, handler });
    },
  };
  return { server: server as any, tools };
}

/** Invoke a captured tool and parse the JSON text payload. */
export async function callTool<T = any>(
  tools: Map<string, CapturedTool>,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  const res = await tool.handler(args);
  const text = res.content?.[0]?.text ?? '';
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}

export function makeCtx(db: Database) {
  return { getDb: () => db, getDbPath: () => ':memory:' };
}
