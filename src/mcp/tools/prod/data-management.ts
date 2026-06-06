import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Database } from '../../../shared/sqlite3-wasm';
import * as nodePath from 'node:path';
import { initializeSchema } from '../../../api/schema';
import { readGedcomFile, parseGedcom, importGedcom, exportGedcom } from '../../../gedcom/index';
import { importFromGenney } from '../../../import/genney/index';
import { importFromHolger } from '../../../import/holger/index';
import { importFromRootsMagic } from '../../../import/rootsmagic/index';
import { importFromGramps } from '../../../import/gramps/index';
import { exportArchive } from '../../../api/archive_export';
import { importArchive } from '../../../api/archive_import';
import { getMediaDir } from '../../../api/media';
import type { UtilityToolContext } from './types';

export function registerDataManagementTools(server: McpServer, ctx: UtilityToolContext): void {
  const { getDb, getDbPath, setDb, setDbPath } = ctx;

  server.registerTool('import_file', {
    description: 'Import genealogy data from a file. Format is auto-detected from extension (.backup/.gcc → genney, .rmgc/.rmtree → rootsmagic, .gramps/.gpkg → gramps, .ged → gedcom) unless overridden. Use format "holger" for Holger/OurKind GEDCOM exports.',
    inputSchema: {
      file_path: z.string().describe('Absolute path to the file to import'),
      format: z.enum(['gedcom', 'genney', 'holger', 'rootsmagic', 'gramps']).optional().describe('Import format (auto-detected if omitted)'),
      media_dir: z.string().optional().describe('For holger imports: path to local OurKind/Media directory for remapping Windows image paths'),
    },
  }, async (args) => {
    const db = getDb();
    const lower = args.file_path.toLowerCase();

    let format = args.format;
    if (!format) {
      if (lower.endsWith('.backup') || lower.endsWith('.gcc')) {
        format = 'genney';
      } else if (lower.endsWith('.rmgc') || lower.endsWith('.rmtree')) {
        format = 'rootsmagic';
      } else if (lower.endsWith('.gramps') || lower.endsWith('.gpkg')) {
        format = 'gramps';
      } else {
        format = 'gedcom';
      }
    }

    if (format === 'gramps') {
      const messages: string[] = [];
      try {
        const fsp = await import('node:fs/promises');
        const mediaDir = getMediaDir(getDbPath());
        const mediaFolderName = nodePath.basename(mediaDir);
        const result = await importFromGramps(db, args.file_path, {
          onProgress: (msg) => messages.push(msg),
          mediaFolderName,
          mediaWriter: async (filename, bytes) => {
            await fsp.mkdir(mediaDir, { recursive: true });
            await fsp.writeFile(nodePath.join(mediaDir, filename), bytes);
          },
        });
        return { content: [{ type: 'text', text: JSON.stringify({ ...result, progress: messages }, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: JSON.stringify({ error: message, progress: messages }, null, 2) }] };
      }
    }

    if (format === 'rootsmagic') {
      const messages: string[] = [];
      try {
        const result = await importFromRootsMagic(db, args.file_path, {
          onProgress: (msg) => messages.push(msg),
        });
        return { content: [{ type: 'text', text: JSON.stringify({ ...result, progress: messages }, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: JSON.stringify({ error: message, progress: messages }, null, 2) }] };
      }
    }

    if (format === 'genney') {
      const messages: string[] = [];
      try {
        const result = await importFromGenney(db, args.file_path, {
          onProgress: (msg) => messages.push(msg),
        });
        return { content: [{ type: 'text', text: JSON.stringify({ ...result, progress: messages }, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: JSON.stringify({ error: message, progress: messages }, null, 2) }] };
      }
    }

    if (format === 'holger') {
      try {
        const result = await importFromHolger(db, {
          sourcePath: args.file_path,
          mediaDir: args.media_dir,
        });
        const r = result.report;
        const eventTotal = Object.values(r.events).reduce((a, b) => a + b, 0);
        return {
          content: [{
            type: 'text',
            text: `Holger import complete: ${r.persons} persons, ${r.families} families, ${eventTotal} events, ${r.sources} sources, ${r.places} places, ${r.citations} citations.`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }

    // gedcom
    const text = readGedcomFile(args.file_path);
    const tree = parseGedcom(text);
    await importGedcom(db, tree, {});
    return { content: [{ type: 'text', text: JSON.stringify({ imported: true, file_path: args.file_path, format: 'gedcom' }) }] };
  });

  server.registerTool('export_gedcom', {
    description: 'Export the entire database as GEDCOM. Returns the GEDCOM content as text.',
    inputSchema: {
      version: z.enum(['5.5.1', '7.0']).optional().describe('GEDCOM version (default: 5.5.1)'),
    },
  }, async (args) => {
    const { ged, report } = await exportGedcom(getDb(), args.version ?? '5.5.1');
    return { content: [{ type: 'text', text: JSON.stringify({ report, gedcom_length: ged.length, ged }, null, 2) }] };
  });

  server.registerTool('export_archive', {
    description: 'Export the database as a .zip archive containing the GEDCOM file plus all linked media. Use this for full backups that round-trip both the tree and the photos. Media file_refs in the GEDCOM are rewritten to point at the archive\'s media/ folder.',
    inputSchema: {
      output_path: z.string().describe('Absolute path where the .zip should be written.'),
      gedcom_version: z.enum(['5.5.1', '7.0']).optional().describe('GEDCOM version (default: 5.5.1).'),
    },
  }, async (args) => {
    const dbDir = nodePath.dirname(getDbPath());
    const report = await exportArchive(getDb(), args.output_path, dbDir, { gedcomVersion: args.gedcom_version });
    return { content: [{ type: 'text', text: JSON.stringify({ output_path: args.output_path, report }, null, 2) }] };
  });

  server.registerTool('import_archive', {
    description: 'Import a .zip archive (GEDCOM + media/) into the active database. Media files are copied into <dbname>-media/ and file_refs are rewritten to relative paths. Pairs with export_archive for full round-trip.',
    inputSchema: {
      archive_path: z.string().describe('Absolute path to the .zip archive to import.'),
    },
  }, async (args) => {
    const mediaDir = getMediaDir(getDbPath());
    const report = await importArchive(getDb(), args.archive_path, mediaDir);
    return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
  });

  server.registerTool('get_current_database', {
    description: 'Get the path of the currently open database file',
  }, async () => {
    return { content: [{ type: 'text', text: JSON.stringify({ path: getDbPath() }, null, 2) }] };
  });

  server.registerTool('switch_database', {
    description: 'Close the current database and open a different one. Creates the file if it does not exist.',
    inputSchema: {
      path: z.string().describe('Absolute path to the SQLite database file to open'),
    },
  }, async (args) => {
    const fs = await import('node:fs');
    const nodePath = await import('node:path');
    fs.mkdirSync(nodePath.default.dirname(args.path), { recursive: true });
    const lockPath = args.path + '.lock';
    if (fs.existsSync(lockPath) && fs.statSync(lockPath).isDirectory()) {
      fs.rmSync(lockPath, { recursive: true });
    }
    getDb().close();
    const newDb = new Database(args.path);
    await initializeSchema(newDb);
    setDb(newDb);
    setDbPath(args.path);
    return { content: [{ type: 'text', text: JSON.stringify({ switched: true, path: args.path }, null, 2) }] };
  });
}
