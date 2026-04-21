/**
 * OpenStreetMap Nominatim geocoding client.
 *
 * Usage policy reminders (https://operations.osmfoundation.org/policies/nominatim/):
 *   - Max 1 request per second.
 *   - Identify the app via User-Agent or a unique Referer.
 *     (Browsers forbid setting User-Agent; sending a custom header satisfies the "unique identifier" spirit.)
 *   - Cache results where reasonable.
 *   - Credit OSM in the UI (the Leaflet tile layer attribution handles this).
 */

const BASE = 'https://nominatim.openstreetmap.org';

export type OsmType = 'node' | 'way' | 'relation';

export interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  suburb?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string;
}

export interface NominatimResult {
  place_id: number;
  osm_type: OsmType;
  osm_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  address?: NominatimAddress;
}

/**
 * Builds a stable Firestore placeId from an OSM type + id.
 * e.g. ('relation', 12345) → 'R_12345'.
 */
export function placeIdFor(osmType: OsmType, osmId: number | string): string {
  return `${osmType[0].toUpperCase()}_${osmId}`;
}

/** Pick the best "city" label from a Nominatim address, falling back through OSM's place-level fields. */
export function cityFromAddress(addr?: NominatimAddress): string {
  if (!addr) return '';
  return (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.hamlet ||
    addr.municipality ||
    addr.suburb ||
    addr.county ||
    ''
  );
}

export function cityKey(city: string): string {
  return city.trim().toLowerCase();
}

export async function searchNominatim(query: string, signal?: AbortSignal): Promise<NominatimResult[]> {
  const url =
    `${BASE}/search` +
    `?q=${encodeURIComponent(query)}` +
    `&format=jsonv2` +
    `&addressdetails=1` +
    `&limit=8`;

  const response = await fetch(url, {
    signal,
    headers: { 'Accept-Language': 'en' },
  });

  if (!response.ok) {
    throw new Error(`Nominatim search failed: ${response.status}`);
  }

  return response.json();
}
