export function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function computeCentroid(geometry: {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}): [number, number] {
  let sumLat = 0, sumLon = 0, count = 0;
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates as number[][][]]
    : geometry.coordinates as number[][][][];

  for (const polygon of polygons) {
    const ring = polygon[0]; // exterior ring only
    for (const [lon, lat] of ring) {
      sumLon += lon;
      sumLat += lat;
      count++;
    }
  }
  return [sumLat / count, sumLon / count];
}

export function avgCoordinates(nodes: Array<{ lat: number; lon: number }>): { lat: number; lon: number } {
  const lat = nodes.reduce((s, n) => s + n.lat, 0) / nodes.length;
  const lon = nodes.reduce((s, n) => s + n.lon, 0) / nodes.length;
  return { lat: round6(lat), lon: round6(lon) };
}

export function weightedCentroid(
  items: Array<{ lat: number; lon: number; weight: number }>,
): { lat: number; lon: number } | null {
  if (items.length === 0) return null;

  const totalWeight = items.reduce((s, c) => s + c.weight, 0);

  if (totalWeight === 0) {
    const lat = items.reduce((s, c) => s + c.lat, 0) / items.length;
    const lon = items.reduce((s, c) => s + c.lon, 0) / items.length;
    return { lat: round6(lat), lon: round6(lon) };
  }

  let lat = 0, lon = 0;
  for (const c of items) {
    lat += c.lat * c.weight;
    lon += c.lon * c.weight;
  }
  return { lat: round6(lat / totalWeight), lon: round6(lon / totalWeight) };
}
