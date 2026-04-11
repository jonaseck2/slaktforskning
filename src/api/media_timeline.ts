import type { Database } from 'node-sqlite3-wasm';
import type { Media } from './types';
import { getMediaForEntity } from './media';
import { getEventsForPerson } from './events';
import { queryAll } from './db';

export interface MediaTimelineItem {
  media: Media & { link_id: string; link_type: number | null; sort_order: number };
  date?: string;
  dateEnd?: string;
  dateType?: string;
  eventType?: string;
  eventDescription?: string;
  placeName?: string;
}

/**
 * Build a chronological media timeline for a person or place.
 *
 * For person: gathers media linked to the person + media linked to their events.
 * For place: gathers media linked to the place + media linked to events at the place.
 *
 * Items are deduplicated by media ID (preferring the version with a date),
 * then sorted with dated items first (by date_value), undated at end.
 */
export function getMediaTimeline(
  db: Database,
  entityType: 'person' | 'place',
  entityId: string,
): MediaTimelineItem[] {
  // 1. Get directly linked media (undated by default)
  const directMedia = getMediaForEntity(db, entityType, entityId);
  const items: MediaTimelineItem[] = directMedia.map(m => ({ media: m }));

  // 2. Get events and their media
  let events: Array<{
    id: string;
    event_type: string;
    date_type: string;
    date_value: string | null;
    date_value_end: string | null;
    description: string;
    place_id: string | null;
  }>;

  if (entityType === 'person') {
    events = getEventsForPerson(db, entityId);
  } else {
    // For place: find events with this place_id
    events = queryAll<{
      id: string;
      event_type: string;
      date_type: string;
      date_value: string | null;
      date_value_end: string | null;
      description: string;
      place_id: string | null;
    }>(db, 'SELECT * FROM events WHERE place_id = ? ORDER BY date_value', [entityId]);
  }

  for (const event of events) {
    const eventMedia = getMediaForEntity(db, 'event', event.id);

    // Resolve place name if available
    let placeName: string | undefined;
    if (event.place_id) {
      const place = queryAll<{ name: string }>(db,
        'SELECT name FROM places WHERE id = ?', [event.place_id]);
      if (place.length > 0) placeName = place[0].name;
    }

    for (const m of eventMedia) {
      items.push({
        media: m,
        date: event.date_value ?? undefined,
        dateEnd: event.date_value_end ?? undefined,
        dateType: event.date_type,
        eventType: event.event_type,
        eventDescription: event.description || undefined,
        placeName,
      });
    }
  }

  // 3. Deduplicate by media ID — prefer version with a date
  const byMediaId = new Map<string, MediaTimelineItem>();
  for (const item of items) {
    const existing = byMediaId.get(item.media.id);
    if (!existing) {
      byMediaId.set(item.media.id, item);
    } else if (!existing.date && item.date) {
      // Replace undated with dated
      byMediaId.set(item.media.id, item);
    }
  }

  // 4. Sort: dated first (by date_value), then undated
  const result = Array.from(byMediaId.values());
  result.sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return 0;
  });

  return result;
}
