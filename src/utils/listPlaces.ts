import type { AreaDoc } from '../api/wire';

export interface ListPlace {
  id: string;
  name: string;
  city: string;
  country: string;
}

export function travelPlaceLink(id: string): string {
  return `/travel?place=${encodeURIComponent(id)}`;
}

export function isTravelPlaceLink(link: string | undefined): boolean {
  if (!link || !link.startsWith('/travel?')) return false;
  const params = new URLSearchParams(link.slice('/travel?'.length));
  return params.size === 1 && !!params.get('place');
}

export function listablePlaces(docs: AreaDoc[]): ListPlace[] {
  return docs.flatMap(({ id, data }) => {
    if (!id || typeof data.displayName !== 'string' || !data.displayName.trim() || Number(data.contributorCount) <= 0 || !Number.isFinite(Number(data.contributorCount))) return [];
    return [{
      id,
      name: data.displayName.split(',')[0].trim(),
      city: typeof data.city === 'string' ? data.city : '',
      country: typeof data.country === 'string' ? data.country : '',
    }];
  }).filter((place) => place.name).sort((a, b) => a.name.localeCompare(b.name) || a.city.localeCompare(b.city));
}

export function searchListPlaces(places: ListPlace[], search: string): ListPlace[] {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return places.filter((place) => {
    const text = `${place.name} ${place.city} ${place.country}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
