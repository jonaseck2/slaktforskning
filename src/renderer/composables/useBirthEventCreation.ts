// src/renderer/composables/useBirthEventCreation.ts

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface BirthEventData {
  date_value?: string;
  date_original?: string;
  place_id?: string | null;
  source_id?: string | null;
  page?: string;
}

export function useBirthEventCreation() {
  async function createBirthEvent(
    personId: string,
    data: BirthEventData
  ): Promise<string | null> {
    if (!window.api) return null;
    const hasData = data.date_value || data.date_original || data.place_id;
    if (!hasData) return null;

    const event = (await window.api.events.create({
      event_type: 'birth',
      date_type: 'exact',
      date_value: data.date_value || null,
      date_original: data.date_original || '',
      place_id: data.place_id || null,
    })) as { id: string };

    await window.api.eventParticipants.add({
      event_id: event.id,
      person_id: personId,
      role: 'primary',
    });

    if (data.source_id) {
      await window.api.citations.create({
        source_id: data.source_id,
        event_id: event.id,
        page: data.page || '',
        confidence: 2,
      });
    }

    return event.id;
  }

  return { createBirthEvent };
}
