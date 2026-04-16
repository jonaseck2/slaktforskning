import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../prod/types';

async function uiGet(uiBase: string, path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${uiBase}${path}`);
  } catch {
    return null;
  }
  return res.json();
}

export function registerInspectTools(server: McpServer, ctx: ToolContext, uiBase: string): void {
  const { getDb } = ctx;

  server.tool(
    'db_stats',
    'Get counts for all major entity types in the current database.',
    {},
    async () => {
      const db = getDb();
      const stmt = db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM persons) as persons,
          (SELECT COUNT(*) FROM relationships) as relationships,
          (SELECT COUNT(*) FROM events) as events,
          (SELECT COUNT(*) FROM places) as places,
          (SELECT COUNT(*) FROM sources) as sources,
          (SELECT COUNT(*) FROM media) as media
      `);
      const row = stmt.getAsObject();
      stmt.free();
      return { content: [{ type: 'text' as const, text: JSON.stringify(row, null, 2) }] };
    }
  );

  server.tool(
    'app_status',
    'Get status of the running Electron app: current route, window size, and database path.',
    {},
    async () => {
      const result = await uiGet(uiBase, '/status') as { route?: string; windowWidth?: number; windowHeight?: number; error?: string } | null;
      if (!result || (result as { error?: string }).error === 'No window available') {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ running: false }, null, 2) }] };
      }
      const dbPath = process.env.SLAKTFORSKNING_DB ?? null;
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ running: true, ...result, dbPath }, null, 2),
        }],
      };
    }
  );
}
