/**
 * Place-search geocoder.
 *
 * Primary backend: Photon (https://photon.komoot.io) — Elasticsearch-backed,
 * built for typeahead, tolerates typos and missing punctuation. Same OSM data
 * as Nominatim, so it returns the same osm_type/osm_id we use as canonical IDs.
 *
 * Fallback: Nominatim (https://nominatim.openstreetmap.org) — broader data
 * (Wikipedia, Tiger, postcodes), used when Photon errors or returns nothing.
 *
 * Usage policy reminders:
 *   - Photon's public API is a demo with no SLA — be polite, prefer self-host
 *     if usage grows (https://github.com/komoot/photon).
 *   - Nominatim: max 1 req/s, identify the app, cache where reasonable
 *     (https://operations.osmfoundation.org/policies/nominatim/).
 *
 * Both providers feed a unified PlaceSearchResult so consumers don't have to
 * care which one served the result.
 */

import type { PlaceCategory } from '../components/travel/travelTypes';

const PHOTON_BASE = 'https://photon.komoot.io';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const PHOTON_TIMEOUT_MS = 4000;

export type OsmType = 'node' | 'way' | 'relation';

export interface PlaceAddress {
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

export interface PlaceSearchResult {
  osm_type: OsmType;
  osm_id: number;
  display_name: string;
  /** Kept as string for parseFloat parity with prior NominatimResult callers. */
  lat: string;
  lon: string;
  /** Nominatim's `class`/`category` or Photon's `osm_key`. */
  category?: string;
  /** Nominatim's `type` or Photon's `osm_value`. */
  type?: string;
  address: PlaceAddress;
  _source: 'photon' | 'nominatim';
}

export interface SearchOptions {
  /** Bias point (latitude). Photon only — ignored on Nominatim fallback. */
  lat?: number;
  /** Bias point (longitude). Photon only. */
  lon?: number;
  /** Map zoom; controls Photon's bias radius. Defaults inside Photon to 12. */
  zoom?: number;
}

/**
 * Builds a stable Firestore placeId from an OSM type + id.
 * e.g. ('relation', 12345) → 'R_12345'.
 */
export function placeIdFor(osmType: OsmType, osmId: number | string): string {
  return `${osmType[0].toUpperCase()}_${osmId}`;
}

/** Pick the best "city" label, falling back through OSM's place-level fields. */
export function cityFromAddress(addr?: PlaceAddress): string {
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

/**
 * Infers a PlaceCategory from a result's class/type fields.
 * Both Photon (osm_key/osm_value) and Nominatim (class/type) feed into this
 * via the unified `category`/`type` fields.
 */
export function categoryFromOsm(result: PlaceSearchResult): PlaceCategory {
  const cls = result.category ?? '';
  const type = result.type ?? '';

  if (cls === 'amenity') {
    if (type === 'pub' || type === 'bar' || type === 'biergarten') return 'pub_bar';
    if (type === 'nightclub') return 'club';
    if (type === 'cafe') return 'cafe';
    if (
      type === 'restaurant' ||
      type === 'fast_food' ||
      type === 'food_court' ||
      type === 'canteen'
    )
      return 'restaurant';
    if (type === 'arts_centre' || type === 'theatre' || type === 'cinema') return 'poi';
  }

  if (cls === 'tourism') {
    if (type === 'museum' || type === 'gallery') return 'gallery_museum';
    if (
      type === 'attraction' ||
      type === 'viewpoint' ||
      type === 'artwork' ||
      type === 'monument' ||
      type === 'zoo' ||
      type === 'theme_park' ||
      type === 'aquarium'
    )
      return 'poi';
  }

  if (cls === 'historic') return 'poi';
  if (cls === 'leisure' && (type === 'park' || type === 'garden' || type === 'nature_reserve'))
    return 'poi';
  if (cls === 'shop') return 'shop';

  return 'other';
}

interface PhotonFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    osm_type?: 'N' | 'W' | 'R';
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    suburb?: string;
    district?: string;
    locality?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
  };
}

interface PhotonResponse {
  type: 'FeatureCollection';
  features: PhotonFeature[];
}

const OSM_TYPE_FROM_LETTER: Record<string, OsmType> = {
  N: 'node',
  W: 'way',
  R: 'relation',
};

/** Photon returns the name + a few address bits separately — compose a Nominatim-style label. */
function composePhotonDisplayName(p: PhotonFeature['properties']): string {
  const parts: string[] = [];
  if (p.name) parts.push(p.name);
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  if (street) parts.push(street);
  const locality = p.city || p.town || p.village || p.hamlet || p.suburb || p.locality;
  if (locality) parts.push(locality);
  if (p.county && p.county !== locality) parts.push(p.county);
  if (p.state) parts.push(p.state);
  if (p.postcode) parts.push(p.postcode);
  if (p.country) parts.push(p.country);
  return parts.join(', ');
}

function adaptPhoton(feature: PhotonFeature): PlaceSearchResult | null {
  const p = feature.properties;
  const letter = p.osm_type;
  if (!letter || !p.osm_id) return null;
  const osmType = OSM_TYPE_FROM_LETTER[letter];
  if (!osmType) return null;
  const [lon, lat] = feature.geometry.coordinates;
  return {
    osm_type: osmType,
    osm_id: p.osm_id,
    display_name: composePhotonDisplayName(p) || p.name || '',
    lat: String(lat),
    lon: String(lon),
    category: p.osm_key,
    type: p.osm_value,
    address: {
      city: p.city,
      town: p.town,
      village: p.village,
      hamlet: p.hamlet,
      suburb: p.suburb,
      county: p.county,
      state: p.state,
      country: p.country,
      country_code: p.countrycode?.toLowerCase(),
    },
    _source: 'photon',
  };
}

async function searchPhoton(
  query: string,
  signal: AbortSignal | undefined,
  opts: SearchOptions,
): Promise<PlaceSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: '8',
    lang: 'en',
  });
  if (typeof opts.lat === 'number' && typeof opts.lon === 'number') {
    params.set('lat', String(opts.lat));
    params.set('lon', String(opts.lon));
    if (typeof opts.zoom === 'number') {
      const z = Math.max(1, Math.min(18, Math.round(opts.zoom)));
      params.set('zoom', String(z));
    }
  }

  const timeoutCtl = new AbortController();
  const timer = setTimeout(() => timeoutCtl.abort(), PHOTON_TIMEOUT_MS);
  const composedSignal = anySignal([signal, timeoutCtl.signal]);

  try {
    const response = await fetch(`${PHOTON_BASE}/api/?${params.toString()}`, {
      signal: composedSignal,
    });
    if (!response.ok) throw new Error(`Photon search failed: ${response.status}`);
    const data: PhotonResponse = await response.json();
    return data.features.map(adaptPhoton).filter((r): r is PlaceSearchResult => r !== null);
  } finally {
    clearTimeout(timer);
  }
}

interface NominatimRaw {
  osm_type: OsmType;
  osm_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  category?: string;
  class?: string;
  address?: PlaceAddress;
}

function adaptNominatim(raw: NominatimRaw): PlaceSearchResult {
  return {
    osm_type: raw.osm_type,
    osm_id: raw.osm_id,
    display_name: raw.display_name,
    lat: raw.lat,
    lon: raw.lon,
    category: raw.category ?? raw.class,
    type: raw.type,
    address: raw.address ?? {},
    _source: 'nominatim',
  };
}

async function searchNominatim(
  query: string,
  signal: AbortSignal | undefined,
): Promise<PlaceSearchResult[]> {
  const url =
    `${NOMINATIM_BASE}/search` +
    `?q=${encodeURIComponent(query)}` +
    `&format=jsonv2` +
    `&addressdetails=1` +
    `&limit=8`;
  const response = await fetch(url, {
    signal,
    headers: { 'Accept-Language': 'en' },
  });
  if (!response.ok) throw new Error(`Nominatim search failed: ${response.status}`);
  const raw: NominatimRaw[] = await response.json();
  return raw.map(adaptNominatim);
}

/**
 * Build a small set of query variants for the Nominatim fallback. Photon already
 * handles typos/punctuation, so this only kicks in when Photon returned nothing
 * AND we're on the legacy fallback path.
 */
function buildNominatimVariants(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const stripped = trimmed
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const possessiveSplit = stripped
    .split(' ')
    .map((w) => (w.length > 3 && /[a-z]s$/i.test(w) ? `${w.slice(0, -1)} s` : w))
    .join(' ');

  const variants = [trimmed];
  if (stripped && stripped !== trimmed) variants.push(stripped);
  if (possessiveSplit && possessiveSplit !== stripped && possessiveSplit !== trimmed) {
    variants.push(possessiveSplit);
  }
  return variants;
}

/**
 * Public entry point. Tries Photon first; falls back to Nominatim (with variant
 * retries) on error or empty result. AbortSignal cancellation is honoured at
 * every step — callers can debounce by aborting the prior call.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  opts: SearchOptions = {},
): Promise<PlaceSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let photonHits: PlaceSearchResult[] = [];
  try {
    photonHits = await searchPhoton(trimmed, signal, opts);
    if (photonHits.length > 0) return photonHits;
  } catch (err) {
    if (signal?.aborted) throw err;
    // Photon errored (network, timeout, 5xx) — fall through to Nominatim.
  }

  if (signal?.aborted) return [];

  const variants = buildNominatimVariants(trimmed);
  for (let i = 0; i < variants.length; i += 1) {
    if (signal?.aborted) return [];
    try {
      const hits = await searchNominatim(variants[i], signal);
      if (hits.length > 0) return hits;
    } catch (err) {
      if (signal?.aborted) throw err;
      // Try next variant.
    }
    // Respect Nominatim's 1 req/s policy between fallback attempts.
    if (i < variants.length - 1) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  return [];
}

/** Compose multiple AbortSignals: aborts when any of them aborts. */
function anySignal(signals: Array<AbortSignal | undefined>): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      controller.abort();
      break;
    }
    s.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}
