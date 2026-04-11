/**
 * Place resolution and update from GEDCOM PLAC nodes.
 */

import type { Database } from 'node-sqlite3-wasm';
import type { GedcomNode } from '../../gedcom/parser';
import type { Place } from '../../api/types';
import { getPlace, updatePlace } from '../../api/places';
import { getChild } from './node-utils';

/**
 * Update a place record with data from PLAC sub-tags (MAP/ADDR/custom tags).
 * Only writes fields that are actually present in the sub-tags; missing sub-tags
 * preserve the existing values via updatePlace's merge logic.
 * Address fields are guarded to prevent overwriting existing place data.
 */
export function updatePlaceFromNode(db: Database, placeId: string, placNode: GedcomNode): void {
  const mapNode = getChild(placNode, 'MAP');
  let lat: number | null = null;
  let lon: number | null = null;
  if (mapNode) {
    const latiStr = getChild(mapNode, 'LATI')?.value ?? '';
    const longStr = getChild(mapNode, 'LONG')?.value ?? '';
    if (latiStr) {
      const dir = latiStr[0];
      const val = parseFloat(latiStr.slice(1));
      if (!isNaN(val)) lat = val * (dir === 'S' ? -1 : 1);
    }
    if (longStr) {
      const dir = longStr[0];
      const val = parseFloat(longStr.slice(1));
      if (!isNaN(val)) lon = val * (dir === 'W' ? -1 : 1);
    }
  }
  const addrNode = getChild(placNode, 'ADDR');
  const street = addrNode ? (getChild(addrNode, 'ADR1')?.value ?? null) : null;
  const postal_code = addrNode ? (getChild(addrNode, 'POST')?.value ?? null) : null;
  const city = addrNode ? (getChild(addrNode, 'CITY')?.value ?? null) : null;
  const country = addrNode ? (getChild(addrNode, 'CTRY')?.value ?? null) : null;
  const place_type = getChild(placNode, '_PTYPE')?.value ?? null;
  const notes = getChild(placNode, '_PNOTES')?.value ?? null;
  const date_from = getChild(placNode, '_DATE_FROM')?.value ?? null;
  const date_to = getChild(placNode, '_DATE_TO')?.value ?? null;

  // Skip the DB write if nothing useful is in the sub-tags
  if (lat == null && lon == null && !street && !postal_code && !city && !country &&
      !place_type && !notes && !date_from && !date_to) return;

  // Get the current place to avoid overwriting existing address fields
  const place = getPlace(db, placeId);

  updatePlace(db, placeId, {
    ...(lat != null && { latitude: lat }),
    ...(lon != null && { longitude: lon }),
    ...(street && !place?.street && { street }),
    ...(postal_code && !place?.postal_code && { postal_code }),
    ...(city && !place?.city && { city }),
    ...(country && !place?.country && { country }),
    ...(place_type && { place_type: place_type as Place['place_type'] }),
    ...(notes && { notes }),
    ...(date_from && { date_from }),
    ...(date_to && { date_to }),
  });
}

/**
 * Resolve a PLAC node to a Place record.
 * - If `_PLAC_ID` sub-tag is present and already mapped, returns the mapped place.
 * - If `_PLAC_ID` refers to an existing UUID in this DB, reuses it (same-DB roundtrip).
 * - Otherwise falls back to resolvePlaceFn (name match / create).
 * - Always applies additional data from sub-tags (MAP, ADDR, etc.) to the resolved place.
 * Updates placeIdMap with old->new UUID mapping for later use in _PLAC records.
 */
export function resolvePlace(
  db: Database,
  placNode: GedcomNode,
  resolvePlaceFn: (db: Database, name: string) => Place,
  placeIdMap: Map<string, string>,
): Place | null {
  const oldPlaceId = getChild(placNode, '_PLAC_ID')?.value;
  let place: Place | null = null;

  if (oldPlaceId) {
    // Check if we already resolved this old ID in this import session
    const mappedId = placeIdMap.get(oldPlaceId);
    if (mappedId) {
      place = getPlace(db, mappedId);
    } else {
      // Same-DB roundtrip: UUID exists verbatim in this DB
      place = getPlace(db, oldPlaceId);
      if (place) placeIdMap.set(oldPlaceId, oldPlaceId);
    }
  }

  if (!place && placNode.value) {
    place = resolvePlaceFn(db, placNode.value);
    if (oldPlaceId && place) placeIdMap.set(oldPlaceId, place.id);
  }

  if (place) updatePlaceFromNode(db, place.id, placNode);

  return place;
}
