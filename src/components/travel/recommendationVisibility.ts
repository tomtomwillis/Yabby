export function visibleRecommendations<T extends { id: string }>(
  places: T[],
  pageSize: number,
  showAll: boolean,
  linkedId: string | null | undefined,
): T[] {
  if (showAll) return places;
  const visible = places.slice(0, pageSize);
  const linked = linkedId && places.find((place) => place.id === linkedId);
  if (linked && !visible.some((place) => place.id === linked.id)) visible.push(linked);
  return visible;
}
