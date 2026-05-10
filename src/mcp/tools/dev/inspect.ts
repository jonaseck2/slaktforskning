import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../prod/types';
import { queryOne } from '../../../api/db';

interface InspectToolContext extends ToolContext {
  getDbPath?: () => string;
}

async function uiGet(uiBase: string, path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${uiBase}${path}`);
  } catch {
    return null;
  }
  return res.json();
}

export function registerInspectTools(server: McpServer, ctx: InspectToolContext, uiBase: string): void {
  const { getDb, getDbPath } = ctx;

  server.tool(
    'db_stats',
    'Get counts for all major entity types in the current database.',
    {},
    async () => {
      const db = getDb();
      const row = await queryOne<{
        persons: number;
        relationships: number;
        events: number;
        places: number;
        sources: number;
        media: number;
      }>(db, `
        SELECT
          (SELECT COUNT(*) FROM persons) as persons,
          (SELECT COUNT(*) FROM relationships) as relationships,
          (SELECT COUNT(*) FROM events) as events,
          (SELECT COUNT(*) FROM places) as places,
          (SELECT COUNT(*) FROM sources) as sources,
          (SELECT COUNT(*) FROM media) as media
      `);
      return { content: [{ type: 'text' as const, text: JSON.stringify(row ?? {}, null, 2) }] };
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
      // Live DB path — follows `switch_database`. Falls back to env var (which
      // only carries the *initial* path the MCP was launched with) when the
      // dev server didn't pass `getDbPath` for backward compatibility.
      const dbPath = getDbPath?.() ?? process.env.SLAKTFORSKNING_DB ?? null;
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ running: true, ...result, dbPath }, null, 2),
        }],
      };
    }
  );
}
