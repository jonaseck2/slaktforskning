/**
 * GEDCOM event node import logic.
 */

import type { Database } from 'node-sqlite3-wasm';
import type { GedcomNode } from '../../gedcom/parser';
import type { Place } from '../../api/types';
import { parseGedcomDate } from '../../gedcom/date';
import { createEvent } from '../../api/events';
import { createCitation } from '../../api/sources';
import { updatePlace } from '../../api/places';
import { addMediaLink } from '../../api/media';
import { FACT_VALUE_GEDCOM_TAGS } from '../../api/events_gedcom';
import { runSql } from '../../api/db';
import type { ImportOptions } from './import-core';
import { getChild, getChildren, resolveNote } from './node-utils';
import { resolvePlace } from './place-resolver';
import { importObjeNode } from './obje-importer';

export async function importEventNode(
  db: Database,
  evNode: GedcomNode,
  appType: string,
  sourceMap: Map<string, string>,
  opts: { relationship_id?: string | null },
  resolvePlaceFn: (db: Database, name: string) => Promise<Place>,
  placeIdMap: Map<string, string>,
  eventIdMap: Map<string, string>,
  noteMap: Map<string, string>,
  objeMap: Map<string, string>,
  importOptions?: ImportOptions,
) {
  const dateNode = getChild(evNode, 'DATE');
  const placNode = getChild(evNode, 'PLAC');
  const parsed = dateNode
    ? parseGedcomDate(dateNode.value)
    : { date_type: 'unknown' as const, date_value: null, date_value_end: null, date_original: '' };
  let place = placNode ? await resolvePlace(db, placNode, resolvePlaceFn, placeIdMap) : null;

  // Standard GEDCOM 5.5.1: ADDR can appear directly on the event node (not under PLAC).
  // Apply address fields to the associated place (or create one from ADDR if no PLAC).
  const evAddrNode = getChild(evNode, 'ADDR');
  if (evAddrNode) {
    const street = getChild(evAddrNode, 'ADR1')?.value ?? evAddrNode.value ?? null;
    const postal_code = getChild(evAddrNode, 'POST')?.value ?? null;
    const city = getChild(evAddrNode, 'CITY')?.value ?? null;
    const country = getChild(evAddrNode, 'CTRY')?.value ?? null;
    if (place) {
      // Update existing place with ADDR data (don't overwrite existing non-null values)
      const addrUpdate: Parameters<typeof updatePlace>[2] = {};
      if (street && !place.street) addrUpdate.street = street;
      if (postal_code && !place.postal_code) addrUpdate.postal_code = postal_code;
      if (city && !place.city) addrUpdate.city = city;
      if (country && !place.country) addrUpdate.country = country;
      if (Object.keys(addrUpdate).length > 0) await updatePlace(db, place.id, addrUpdate);
    } else if (city || street) {
      // No PLAC but ADDR present — create a place from the address data
      const placeName = city ?? street ?? 'Unknown';
      place = await resolvePlaceFn(db, placeName);
      const addrUpdate: Parameters<typeof updatePlace>[2] = {};
      if (street) addrUpdate.street = street;
      if (postal_code) addrUpdate.postal_code = postal_code;
      if (city) addrUpdate.city = city;
      if (country) addrUpdate.country = country;
      if (Object.keys(addrUpdate).length > 0) await updatePlace(db, place.id, addrUpdate);
    }
  }

  const causeValue = getChild(evNode, 'CAUS')?.value ?? null;
  const typeValue = getChild(evNode, 'TYPE')?.value ?? '';
  const noteRaw = resolveNote(evNode, noteMap);

  // GEDCOM 5.5.1 line value: for fact-shaped tags (OCCU/RELI/EDUC/etc.) this
  // is the Fact.value (occupation name, religion, etc.). For other event tags
  // any non-empty line value is non-standard input — append to notes with a
  // marker rather than dropping silently (Prime Directive: never drop authored data).
  const gedcomTag = evNode.tag;
  const lineValue = evNode.value?.trim() || null;
  const isFactTag = FACT_VALUE_GEDCOM_TAGS.has(gedcomTag);
  const value = isFactTag ? lineValue : null;

  // Notes assembly (Prime Directive: never drop authored data):
  //  - GEDCOM TYPE sub-tags are stored as `TYPE: <value>` on their own line at
  //    the start of notes. This lets the exporter recover the TYPE and emit it
  //    as a `2 TYPE` sub-tag on round-trip.
  //  - User-authored NOTE content follows after a blank line.
  //  - For non-fact tags with a stray line value (non-standard input), append
  //    it with a marker rather than dropping silently.
  const noteParts: string[] = [];
  if (typeValue) {
    noteParts.push(`TYPE: ${typeValue}`);
  }
  if (noteRaw) noteParts.push(noteRaw);
  if (!isFactTag && lineValue) {
    noteParts.push(`[unmapped line value: ${lineValue}]`);
  }
  const notes = noteParts.join('\n\n') || '';

  // Custom _PLAC_ADDR sub-tag: event-specific free-text address authored by the
  // user, distinct from the place's standalone ADDR. The exporter emits it under
  // PLAC at level 3 when a PLAC line is present, otherwise directly under the
  // event at level 2 (so authored data survives even with no place attached).
  // Read both locations.
  const placAddrFromPlac = placNode ? getChild(placNode, '_PLAC_ADDR')?.value ?? null : null;
  const placAddrFromEvent = getChild(evNode, '_PLAC_ADDR')?.value ?? null;
  const placeAddress = placAddrFromPlac ?? placAddrFromEvent ?? null;

  const event = await createEvent(db, {
    event_type: appType,
    date_type: parsed.date_type,
    date_value: parsed.date_value,
    date_value_end: parsed.date_value_end,
    date_original: parsed.date_original,
    place_id: place?.id ?? null,
    relationship_id: opts.relationship_id ?? null,
    cause: causeValue,
    value,
    notes,
  });

  // place_address is not in the createEvent API surface — set it directly when present.
  if (placeAddress) {
    await runSql(db, 'UPDATE events SET place_address = ? WHERE id = ?', [placeAddress, event.id]);
  }

  // Track old→new event ID so ASSO _EVID references resolve across databases
  const oldEvid = getChild(evNode, '_EVID')?.value;
  if (oldEvid) eventIdMap.set(oldEvid, event.id);

  // Inline source citations
  for (const sour of getChildren(evNode, 'SOUR')) {
    const srcId = sourceMap.get(sour.value) ?? sourceMap.get(sour.xref ?? '');
    if (srcId) {
      const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
      const page = getChild(sour, 'PAGE')?.value ?? '';
      const dataNode = getChild(sour, 'DATA');
      const transcription = dataNode ? getChild(dataNode, 'TEXT')?.value ?? '' : '';
      const notes = getChild(sour, 'NOTE')?.value ?? '';
      const date_accessed = getChild(sour, '_ACCESSED')?.value ?? '';
      await createCitation(db, {
        source_id: srcId,
        event_id: event.id,
        page,
        confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
        transcription,
        notes: notes || undefined,
        date_accessed: date_accessed || undefined,
      });
    }
  }

  // Event media
  let eventMediaOrder = 0;
  for (const objeNode of getChildren(evNode, 'OBJE')) {
    const mediaId = await importObjeNode(db, objeNode, objeMap, importOptions);
    if (mediaId) {
      await addMediaLink(db, { media_id: mediaId, entity_type: 'event', entity_id: event.id, sort_order: eventMediaOrder });
      eventMediaOrder++;
    }
  }

  return event;
}
