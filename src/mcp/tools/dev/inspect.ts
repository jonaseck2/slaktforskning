import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../prod/types';
import { queryOne } from '../../../api/db';
import { runScript, liveDbPath } from './ui';
import { runScript } from './ui';

interface InspectToolContext extends ToolContext {
  getDbPath?: () => string;
}

/** Read the active app's DB path from the bridge's /db_path endpoint. */
async function liveDbPath(uiBase: string): Promise<string | null> {
  try {
    const res = await fetch(`${uiBase}/db_path`);
    const body = await res.json() as { path?: string | null };
    return body.path ?? null;
  } catch { return null; }
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
      // Pull route + window dimensions through /eval. dbPath comes from the
      // bridge's /db_path endpoint (live; follows db.switchTo dialogs).
      let result: { route?: string; windowWidth?: number; windowHeight?: number; error?: string } | null;
      try {
        result = await runScript(uiBase, '({ route: window.__vue_router ? window.__vue_router.currentRoute.value.fullPath : null, windowWidth: window.innerWidth, windowHeight: window.innerHeight })') as typeof result;
      } catch {
        result = null;
      }
      if (!result || result.error === 'No window available') {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ running: false }, null, 2) }] };
      }
      const dbPath = (await liveDbPath(uiBase)) ?? getDbPath?.() ?? process.env.SLAKTFORSKNING_DB ?? null;
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ running: true, ...result, dbPath }, null, 2),
        }],
      };
    }
  );
}
