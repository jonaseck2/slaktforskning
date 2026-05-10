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
      const result = await uiGet(uiBase, '/status') as { route?: string; windowWidth?: number; windowHeight?: number; dbPath?: string; error?: string } | null;
      if (!result || (result as { error?: string }).error === 'No window available') {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ running: false }, null, 2) }] };
      }
      // Prefer the live dbPath from the running app (Tauri /status returns
      // it, follows db.switchTo dialogs). Fall back to the MCP's own cache
      // (set by switch_database tool calls), then the launch-time env var.
      const dbPath = result.dbPath ?? getDbPath?.() ?? process.env.SLAKTFORSKNING_DB ?? null;
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ running: true, ...result, dbPath }, null, 2),
        }],
      };
    }
  );
}
