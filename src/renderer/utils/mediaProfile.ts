declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface LinkRow {
  id: string;       // media id
  link_id: string;  // media_link id
}

export async function setMediaAsPersonProfile(personId: string, mediaId: string): Promise<void> {
  const links = await window.api.media.forEntity('person', personId) as LinkRow[];
  const target = links.find(l => l.id === mediaId);
  if (!target) return;
  const reordered = [target.link_id, ...links.filter(l => l.id !== mediaId).map(l => l.link_id)];
  await window.api.media.reorder(reordered);
}

export async function isMediaPersonProfile(personId: string, mediaId: string): Promise<boolean> {
  const links = await window.api.media.forEntity('person', personId) as LinkRow[];
  return links.length > 0 && links[0].id === mediaId;
}
