import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebaseConfig';
import TravelMap, { type TravelMapView } from '../components/travel/TravelMap';
import TravelAddBox from '../components/travel/TravelAddBox';
import TravelConfirmForm from '../components/travel/TravelConfirmForm';
import TravelFilters, { type Facet } from '../components/travel/TravelFilters';
import TravelPlaceBubble from '../components/travel/TravelPlaceBubble';
import TravelRecommendationList from '../components/travel/TravelRecommendationList';
import { getUserData } from '../utils/userCache';
import { onPageScroll, scrollPageTo } from '../utils/pageScroll';
import { trackedGetDocs } from '../utils/firestoreMetrics';
import {
  categoryFromOsm,
  cityFromAddress,
  placeIdFor,
  type PlaceSearchResult,
  type OsmType,
} from '../utils/geocode';
import {
  saveTravelContribution,
  deleteTravelContribution,
} from '../utils/travelApi';
import Header from '../components/basic/Header';
import { PLACE_CATEGORIES } from '../components/travel/travelTypes';
import type { Place, PlaceCategory, TravelPhoto } from '../components/travel/travelTypes';
import './TravelPage.css';

interface UserPlaceMembership {
  [userId: string]: Set<string>;
}

/** Which facet a count is being taken for — that one is left out of the match,
 *  so each index shows what choosing a value would actually leave. */
type Facetted = 'city' | 'category' | 'user' | null;

function trackFilter(type: string) {
  try {
    window.umami?.track?.('travel_filter_changed', { type });
  } catch {
    /* ignore umami errors */
  }
}

async function loadPlacesAndMemberships(): Promise<{ places: Place[]; memberships: UserPlaceMembership }> {
  const snap = await trackedGetDocs(collection(db, 'places'));

  // contributorIds is denormalised onto the place by the travel API on every
  // write path, so the filter needs no subcollection reads.
  const memberships: UserPlaceMembership = {};

  const places = snap.docs.map((d) => {
    const data = d.data();
    const category = (data.category as PlaceCategory) || 'other';
    const rawCategories = Array.isArray(data.categories) ? (data.categories as PlaceCategory[]) : null;
    const categories = rawCategories && rawCategories.length > 0 ? rawCategories : [category];

    if (Array.isArray(data.contributorIds)) {
      for (const uid of data.contributorIds as string[]) {
        if (!uid) continue;
        if (!memberships[uid]) memberships[uid] = new Set();
        memberships[uid].add(d.id);
      }
    }

    return {
      id: d.id,
      displayName: data.displayName,
      lat: Number(data.lat),
      lng: Number(data.lng),
      city: data.city || '',
      cityKey: data.cityKey || '',
      country: data.country || '',
      osmType: data.osmType || '',
      osmId: data.osmId || '',
      category,
      categories,
      contributorCount: Number(data.contributorCount) || 0,
      firstContributorUserId: data.firstContributorUserId || '',
      firstContributorAvatar: data.firstContributorAvatar || '',
      firstContributorUsername: data.firstContributorUsername || '',
      createdAt: data.createdAt ?? null,
      lastActivityAt: data.lastActivityAt ?? null,
    };
  });

  return { places, memberships };
}

export default function TravelPage() {
  const [user] = useAuthState(auth);
  const [places, setPlaces] = useState<Place[]>([]);
  const [memberships, setMemberships] = useState<UserPlaceMembership>({});
  const [usernamesById, setUsernamesById] = useState<Record<string, string>>({});
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [picked, setPicked] = useState<PlaceSearchResult | null>(null);
  const [pickedCategoryHint, setPickedCategoryHint] = useState<PlaceCategory | null>(null);
  const [cityFilter, setCityFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PlaceCategory | ''>('');
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [mapView, setMapView] = useState<TravelMapView | null>(null);
  const [deepLinkedPlaceId, setDeepLinkedPlaceId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  const refresh = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const { places: loaded, memberships: m } = await loadPlacesAndMemberships();
      setPlaces(loaded);
      setMemberships(m);

      const userIds = Array.from(new Set(Object.keys(m)));
      const entries = await Promise.all(
        userIds.map(async (uid) => {
          const data = await getUserData(uid);
          return [uid, data.username] as const;
        }),
      );
      setUsernamesById(Object.fromEntries(entries));
    } catch (err) {
      setPageError((err as Error).message || 'Could not load recommendations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    getUserData(user.uid).then((data) => {
      setCurrentUserAvatar(data.avatar || '');
    });
  }, [user]);

  const handleCityChange = useCallback(
    (key: string) => {
      setCityFilter(key);
      if (!key) {
        setFocus(null);
        return;
      }
      const firstInCity = places.find((p) => p.cityKey === key);
      if (firstInCity) setFocus({ lat: firstInCity.lat, lng: firstInCity.lng, zoom: 11 });
    },
    [places],
  );

  // Consume ?city= and ?place= query params once places are loaded
  useEffect(() => {
    if (places.length === 0) return;
    const cityParam = searchParams.get('city');
    const placeParam = searchParams.get('place');
    if (cityParam) handleCityChange(cityParam);
    if (placeParam) setDeepLinkedPlaceId(placeParam);
  }, [places, searchParams, handleCityChange]);

  // Pan map to deep-linked place
  useEffect(() => {
    if (!deepLinkedPlaceId || places.length === 0) return;
    const target = places.find((p) => p.id === deepLinkedPlaceId);
    if (target) setFocus({ lat: target.lat, lng: target.lng, zoom: 15 });
  }, [deepLinkedPlaceId, places]);

  /** Does this place survive the filters, ignoring the one being counted? */
  const matches = useCallback(
    (p: Place, skip: Facetted) =>
      (skip === 'city' || !cityFilter || p.cityKey === cityFilter) &&
      (skip === 'category' || !categoryFilter || p.categories.includes(categoryFilter)) &&
      (skip === 'user' || !userFilter || (memberships[userFilter]?.has(p.id) ?? false)),
    [cityFilter, categoryFilter, userFilter, memberships],
  );

  /** A place whose last contribution was deleted is still in the collection but
   *  has nothing to show, so nothing on the page counts it. */
  const livePlaces = useMemo(() => places.filter((p) => p.contributorCount > 0), [places]);

  const filteredPlaces = useMemo(
    () => livePlaces.filter((p) => matches(p, null)),
    [livePlaces, matches],
  );

  const cityFacet = useMemo(() => {
    const labels = new Map<string, string>();
    const counts = new Map<string, number>();
    let allCount = 0;
    for (const p of livePlaces) {
      if (!p.cityKey) continue;
      if (!labels.has(p.cityKey)) labels.set(p.cityKey, p.city || p.cityKey);
      if (!matches(p, 'city')) continue;
      allCount += 1;
      counts.set(p.cityKey, (counts.get(p.cityKey) ?? 0) + 1);
    }
    const options = Array.from(labels.entries())
      .map(([value, label]) => ({ value, label, count: counts.get(value) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return { options, allCount };
  }, [livePlaces, matches]);

  const categoryFacet = useMemo(() => {
    const counts = new Map<string, number>();
    let allCount = 0;
    for (const p of livePlaces) {
      if (!matches(p, 'category')) continue;
      allCount += 1;
      for (const c of new Set(p.categories)) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const options = PLACE_CATEGORIES.map((c) => ({
      value: c.value,
      label: c.label.toLowerCase(),
      count: counts.get(c.value) ?? 0,
    })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return { options, allCount };
  }, [livePlaces, matches]);

  const userFacet = useMemo(() => {
    const eligible = new Set(livePlaces.filter((p) => matches(p, 'user')).map((p) => p.id));
    const options = Object.entries(memberships)
      .map(([uid, placeIds]) => ({
        value: uid,
        label: usernamesById[uid] ?? 'anonymous',
        count: Array.from(placeIds).filter((id) => eligible.has(id)).length,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return { options, allCount: eligible.size };
  }, [livePlaces, memberships, usernamesById, matches]);

  const facets = useMemo<Facet[]>(
    () => [
      {
        key: 'city',
        value: cityFilter,
        options: cityFacet.options,
        allCount: cityFacet.allCount,
        onChange: (value: string) => {
          handleCityChange(value);
          trackFilter('city');
        },
      },
      {
        key: 'category',
        value: categoryFilter,
        options: categoryFacet.options,
        allCount: categoryFacet.allCount,
        onChange: (value: string) => {
          setCategoryFilter(value as PlaceCategory | '');
          trackFilter('category');
        },
      },
      {
        key: 'by',
        value: userFilter,
        options: userFacet.options,
        allCount: userFacet.allCount,
        onChange: (value: string) => {
          setUserFilter(value);
          trackFilter('user');
        },
      },
    ],
    [cityFilter, categoryFilter, userFilter, cityFacet, categoryFacet, userFacet, handleCityChange],
  );

  const clearFilters = useCallback(() => {
    handleCityChange('');
    setCategoryFilter('');
    setUserFilter('');
  }, [handleCityChange]);

  const suggestedCategory: PlaceCategory = pickedCategoryHint
    ?? (picked ? categoryFromOsm(picked) : 'other');

  const confirmAdd = useCallback(
    async ({ comment, photos, category }: { comment: string; photos: TravelPhoto[]; category: PlaceCategory }) => {
      if (!user || !picked) throw new Error('Not signed in.');

      const placeId = placeIdFor(picked.osm_type, picked.osm_id);
      const cityName = cityFromAddress(picked.address);

      await saveTravelContribution({
        placeId,
        displayName: picked.display_name,
        lat: parseFloat(picked.lat),
        lng: parseFloat(picked.lon),
        city: cityName,
        country: picked.address?.country || '',
        osmType: picked.osm_type,
        osmId: String(picked.osm_id),
        category,
        comment,
        photos,
      });

      try {
        window.umami?.track?.('travel_place_added', { placeId, category });
      } catch {
        /* ignore umami errors */
      }

      setPicked(null);
      setPickedCategoryHint(null);
      setFocus({ lat: parseFloat(picked.lat), lng: parseFloat(picked.lon), zoom: 12 });
      await refresh();
    },
    [user, picked, refresh],
  );

  const editContribution = useCallback(
    async (placeId: string, userId: string, next: { comment: string; photos: TravelPhoto[]; category: PlaceCategory }) => {
      if (!user || user.uid !== userId) throw new Error('Cannot edit another user\'s recommendation.');
      const place = places.find((p) => p.id === placeId);
      if (!place) throw new Error('Place not found.');

      await saveTravelContribution({
        placeId,
        displayName: place.displayName,
        lat: place.lat,
        lng: place.lng,
        city: place.city,
        country: place.country,
        osmType: place.osmType,
        osmId: place.osmId,
        category: next.category,
        comment: next.comment,
        photos: next.photos,
      });

      try {
        window.umami?.track?.('travel_contribution_edited', { placeId });
      } catch {
        /* ignore */
      }
      await refresh();
    },
    [user, places, refresh],
  );

  const deleteContribution = useCallback(
    async (placeId: string, userId: string) => {
      if (!user || user.uid !== userId) throw new Error('Cannot delete another user\'s recommendation.');
      await deleteTravelContribution(placeId);
      try {
        window.umami?.track?.('travel_contribution_deleted', { placeId });
      } catch {
        /* ignore */
      }
      await refresh();
    },
    [user, refresh],
  );

  const visiblePlaces = useMemo(() => {
    const tsMillis = (p: Place) => {
      const ts = p.lastActivityAt ?? p.createdAt;
      return ts ? ts.toMillis() : 0;
    };
    return filteredPlaces.slice().sort((a, b) => tsMillis(b) - tsMillis(a));
  }, [filteredPlaces]);

  const recSectionRef = useRef<HTMLDivElement>(null);
  const [scrolledToList, setScrolledToList] = useState(false);

  const handleJump = useCallback(() => {
    if (scrolledToList) {
      scrollPageTo({ top: 0, behavior: 'smooth' });
    } else if (recSectionRef.current) {
      recSectionRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scrolledToList]);

  useEffect(() => {
    const handleScroll = () => {
      if (!recSectionRef.current) return;
      const rect = recSectionRef.current.getBoundingClientRect();
      setScrolledToList(rect.top < window.innerHeight * 0.5);
    };
    return onPageScroll(handleScroll);
  }, []);

  const handleAddOwn = useCallback((p: Place) => {
    const synthetic: PlaceSearchResult = {
      osm_type: (p.osmType as OsmType) || 'node',
      osm_id: Number(p.osmId) || 0,
      display_name: p.displayName,
      lat: String(p.lat),
      lon: String(p.lng),
      address: { city: p.city, country: p.country },
      _source: 'nominatim',
    };
    setPickedCategoryHint(p.category);
    setPicked(synthetic);
  }, []);

  const renderBubble = useCallback(
    (p: Place) => (
      <TravelPlaceBubble
        place={p}
        currentUserId={user?.uid ?? null}
        onEditContribution={editContribution}
        onDeleteContribution={deleteContribution}
        onAddOwn={handleAddOwn}
      />
    ),
    [user?.uid, editContribution, deleteContribution, handleAddOwn],
  );

  return (
    <div className="travel-page">
      <Header title="Travel" subtitle="IRL recommendations from the Yabby community" />

      {/* The map runs the full width of the column, ruled off top and bottom
          like any other band on the sheet. */}
      <div className="tv-map">
        <TravelMap
          places={visiblePlaces}
          focus={focus}
          onViewChange={setMapView}
          renderBubble={renderBubble}
        />
      </div>

      <TravelFilters
        facets={facets}
        shown={visiblePlaces.length}
        total={livePlaces.length}
        onClear={clearFilters}
      />

      {/* The one band on the page that is an input rather than content. */}
      <div className="tv-add">
        <div className="tv-add-row">
          <span className="tv-add-label">add</span>
          <TravelAddBox onPick={setPicked} bias={mapView ?? undefined} />
        </div>

        {picked && (
          <TravelConfirmForm
            picked={picked}
            currentUserAvatar={currentUserAvatar}
            suggestedCategory={suggestedCategory}
            onConfirm={confirmAdd}
            onCancel={() => {
              setPicked(null);
              setPickedCategoryHint(null);
            }}
          />
        )}
      </div>

      <div className="tv-list" ref={recSectionRef}>
        <h2 className="tv-h">
          <span className="tv-h-label">recommendations</span>
          <span className="tv-h-rule" aria-hidden="true" />
          <span className="tv-h-note">
            {visiblePlaces.length} {visiblePlaces.length === 1 ? 'entry' : 'entries'}
          </span>
        </h2>

        {loading && <p className="tv-status">loading recommendations…</p>}
        {pageError && <p className="tv-error">{pageError}</p>}
        {!loading && !pageError && (
          <TravelRecommendationList
            places={visiblePlaces}
            currentUserId={user?.uid ?? null}
            onEditContribution={editContribution}
            onDeleteContribution={deleteContribution}
            onFocus={(p) => setFocus({ lat: p.lat, lng: p.lng, zoom: 14 })}
            onAddOwn={handleAddOwn}
            initialExpandedId={deepLinkedPlaceId}
          />
        )}
      </div>

      {/* A word, not a floating disc: the only thing on the page pinned to the
          viewport, so it stays the plainest control here. */}
      <button className="tv-jump" onClick={handleJump} type="button">
        {scrolledToList ? '↑ map' : '↓ list'}
      </button>
    </div>
  );
}
