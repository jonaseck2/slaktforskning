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
import type { ImportOptions } from './import-core';
import { getChild, getChildren, resolveNote } from './node-utils';
import { resolvePlace } from './place-resolver';
import { importObjeNode } from './obje-importer';

export function importEventNode(
  db: Database,
  evNode: GedcomNode,
  appType: string,
  sourceMap: Map<string, string>,
  opts: { relationship_id?: string | null },
  resolvePlaceFn: (db: Database, name: string) => Place,
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
  let place = placNode ? resolvePlace(db, placNode, resolvePlaceFn, placeIdMap) : null;

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
      if (Object.keys(addrUpdate).length > 0) updatePlace(db, place.id, addrUpdate);
    } else if (city || street) {
      // No PLAC but ADDR present — create a place from the address data
      const placeName = city ?? street ?? 'Unknown';
      place = resolvePlaceFn(db, placeName);
      const addrUpdate: Parameters<typeof updatePlace>[2] = {};
      if (street) addrUpdate.street = street;
      if (postal_code) addrUpdate.postal_code = postal_code;
      if (city) addrUpdate.city = city;
      if (country) addrUpdate.country = country;
      if (Object.keys(addrUpdate).length > 0) updatePlace(db, place.id, addrUpdate);
    }
  }

  const causeValue = getChild(evNode, 'CAUS')?.value ?? null;
  const typeValue = getChild(evNode, 'TYPE')?.value ?? '';
  const noteRaw = resolveNote(evNode, noteMap);
  const noteValue = typeValue && noteRaw
    ? `${typeValue}: ${noteRaw}`
    : typeValue || noteRaw;

  const event = createEvent(db, {
    event_type: appType,
    date_type: parsed.date_type,
    date_value: parsed.date_value,
    date_value_end: parsed.date_value_end,
    date_original: parsed.date_original,
    place_id: place?.id ?? null,
    relationship_id: opts.relationship_id ?? null,
    cause: causeValue,
    notes: noteValue,
  });

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
      createCitation(db, {
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
    const mediaId = importObjeNode(db, objeNode, objeMap, importOptions);
    if (mediaId) {
      addMediaLink(db, { media_id: mediaId, entity_type: 'event', entity_id: event.id, sort_order: eventMediaOrder });
      eventMediaOrder++;
    }
  }

  return event;
}
