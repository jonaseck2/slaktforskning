import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readGedcomFile, parseGedcom, importGedcom, exportGedcom } from '../../gedcom';
import type { ImportOptions } from '../../import/gedcom';
import { importFromGenney } from '../../import/genney/index';
import { importFromHolger } from '../../import/holger/index';
import type { ToolContext } from './types';

export function registerImportExportTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.registerTool('import_gedcom', {
    description: 'Import a GEDCOM 5.5.1 .ged file from disk into the database. Use profile "genney" for Genney 4.1 GEDCOM exports to enable Swedish hierarchical places, patronymic detection, and Genney custom tags. For Genney .backup/.gcc archives, use import_genney instead.',
    inputSchema: {
      file_path: z.string().describe('Absolute path to the .ged file to import'),
      profile: z.enum(['genney']).optional().describe('Import profile. "genney" enables Genney 4.1 extensions: Swedish hierarchical places, patronymic detection, _UID/_YHAPLOGROUP/_MHAPLOGROUP tags.'),
    },
  }, async (args) => {
    const lower = args.file_path.toLowerCase();
    if (lower.endsWith('.backup') || lower.endsWith('.gcc')) {
      return { content: [{ type: 'text', text: 'Error: .backup and .gcc files are Genney archives, not GEDCOM files. Use the import_genney tool instead.' }] };
    }
    const fs = await import('fs');
    const text = readGedcomFile(args.file_path);
    const tree = parseGedcom(text);
    const options: ImportOptions = args.profile ? { profile: args.profile } : {};
    importGedcom(getDb(), tree, options);
    return { content: [{ type: 'text', text: JSON.stringify({ imported: true, file_path: args.file_path, profile: args.profile ?? null }) }] };
  });

  server.registerTool('import_genney', {
    description: 'Import a Genney 4.1 archive (.backup or .gcc) or Derby database directory into the database. Downloads Derby extraction tools on first use (~30 MB, requires internet). Requires Java or Docker.',
    inputSchema: {
      file_path: z.string().describe('Absolute path to the .backup/.gcc archive or extracted Derby database directory'),
      schema: z.string().optional().describe('Override the auto-detected Derby schema name'),
    },
  }, async (args) => {
    const messages: string[] = [];
    try {
      const result = await importFromGenney(getDb(), args.file_path, {
        schema: args.schema,
        onProgress: (msg) => messages.push(msg),
      });
      return { content: [{ type: 'text', text: JSON.stringify({ ...result, progress: messages }, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: JSON.stringify({ error: message, progress: messages }, null, 2) }] };
    }
  });

  server.registerTool('import_holger', {
    description:
      'Import a Holger/OurKind GEDCOM export (.ged or .zip) into the database. ' +
      'Handles Holger-specific ENGA TYPE semantics (couple subtypes: Sambo→cohabitation, Partner→cohabitation, ' +
      'Parter→cohabitation, Särbo→cohabitation, Relation→other, Förlovade→unknown) and ADOP TYPE ' +
      '(Fosterbarn→foster, Adoptivbarn→adopted). ' +
      'Optionally remaps Windows-style OBJE FILE paths to a local media directory. ' +
      'To generate the GEDCOM from Holger: Arkiv → Exportera GEDCOM → Generellt format, ANSI encoding.',
    inputSchema: {
      source_path: z.string().describe('Path to a .ged file, a .zip containing a .ged, or a folder containing a .ged'),
      media_dir: z.string().optional().describe('Optional: path to local OurKind/Media directory for remapping Windows image paths'),
    },
  }, async (args) => {
    try {
      const result = await importFromHolger(getDb(), {
        sourcePath: args.source_path,
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
  });

  server.registerTool('export_gedcom', {
    description: 'Export the entire database as GEDCOM 5.5.1. If file_path is provided, writes to disk; otherwise returns the content.',
    inputSchema: {
      file_path: z.string().optional().describe('Absolute path to write the .ged file. If omitted, returns GEDCOM content as text.'),
    },
  }, async (args) => {
    const { ged, report } = exportGedcom(getDb());
    if (args.file_path) {
      const fs = await import('fs');
      fs.writeFileSync(args.file_path, ged, 'utf-8');
      return { content: [{ type: 'text', text: JSON.stringify({ exported: true, file_path: args.file_path, report }) }] };
    }
    return { content: [{ type: 'text', text: ged }] };
  });
}
