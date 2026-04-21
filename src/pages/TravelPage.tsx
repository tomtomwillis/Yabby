import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebaseConfig';
import Header from '../components/basic/Header';
import TravelMap from '../components/travel/TravelMap';
import TravelAddBox from '../components/travel/TravelAddBox';
import TravelConfirmForm from '../components/travel/TravelConfirmForm';
import TravelFilters, {
  type CityOption,
  type UserOption,
} from '../components/travel/TravelFilters';
import TravelPlaceBubble from '../components/travel/TravelPlaceBubble';
import { getUserData } from '../utils/userCache';
import { trackedGetDocs } from '../utils/firestoreMetrics';
import {
  cityFromAddress,
  placeIdFor,
  type NominatimResult,
} from '../utils/nominatim';
import {
  saveTravelContribution,
  deleteTravelContribution,
} from '../utils/travelApi';
import type { Place, TravelPhoto } from '../components/travel/travelTypes';
import './TravelPage.css';

interface UserPlaceMembership {
  [userId: string]: Set<string>; // userId → set of placeIds they've contributed to
}

async function loadPlaces(): Promise<Place[]> {
  const snap = await trackedGetDocs(collection(db, 'places'));
  return snap.docs.map((d) => {
    const data = d.data();
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
      contributorCount: Number(data.contributorCount) || 0,
      firstContributorUserId: data.firstContributorUserId || '',
      firstContributorAvatar: data.firstContributorAvatar || '',
      firstContributorUsername: data.firstContributorUsername || '',
      createdAt: data.createdAt ?? null,
      lastActivityAt: data.lastActivityAt ?? null,
    };
  });
}

async function loadUserMemberships(): Promise<UserPlaceMembership> {
  const snap = await trackedGetDocs(collection(db, 'places'));
  const byUser: UserPlaceMembership = {};
  for (const placeDoc of snap.docs) {
    const contribSnap = await trackedGetDocs(
      collection(db, 'places', placeDoc.id, 'contributions'),
    );
    for (const c of contribSnap.docs) {
      const uid = c.data().userId as string;
      if (!byUser[uid]) byUser[uid] = new Set();
      byUser[uid].add(placeDoc.id);
    }
  }
  return byUser;
}

export default function TravelPage() {
  const [user] = useAuthState(auth);
  const [places, setPlaces] = useState<Place[]>([]);
  const [memberships, setMemberships] = useState<UserPlaceMembership>({});
  const [usernamesById, setUsernamesById] = useState<Record<string, string>>({});
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [picked, setPicked] = useState<NominatimResult | null>(null);
  const [cityFilter, setCityFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const loaded = await loadPlaces();
      setPlaces(loaded);
      const m = await loadUserMemberships();
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

  const filteredPlaces = useMemo(() => {
    let list = places;
    if (cityFilter) list = list.filter((p) => p.cityKey === cityFilter);
    if (userFilter) {
      const set = memberships[userFilter] ?? new Set<string>();
      list = list.filter((p) => set.has(p.id));
    }
    return list;
  }, [places, cityFilter, userFilter, memberships]);

  const cities = useMemo<CityOption[]>(() => {
    const seen = new Map<string, string>();
    for (const p of places) {
      if (p.cityKey && !seen.has(p.cityKey)) {
        seen.set(p.cityKey, p.city || p.cityKey);
      }
    }
    return Array.from(seen.entries())
      .map(([cityKey, label]) => ({ cityKey, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [places]);

  const users = useMemo<UserOption[]>(() => {
    return Object.keys(memberships)
      .map((uid) => ({ userId: uid, username: usernamesById[uid] ?? 'Anonymous' }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [memberships, usernamesById]);

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

  const confirmAdd = useCallback(
    async ({ comment, photos }: { comment: string; photos: TravelPhoto[] }) => {
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
        comment,
        photos,
      });

      try {
        window.umami?.track?.('travel_place_added', { placeId });
      } catch {
        /* ignore umami errors */
      }

      setPicked(null);
      setFocus({ lat: parseFloat(picked.lat), lng: parseFloat(picked.lon), zoom: 12 });
      await refresh();
    },
    [user, picked, refresh],
  );

  const editContribution = useCallback(
    async (placeId: string, userId: string, next: { comment: string; photos: TravelPhoto[] }) => {
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

  const visiblePlaces = filteredPlaces.filter((p) => p.contributorCount > 0);

  return (
    <div className="travel-page">
      <Header title="Travel Recommendations" subtitle="Places we love, pinned on a map" />

      <div className="travel-page__add-card">
        <h2>Add a recommendation</h2>
        {!picked ? (
          <TravelAddBox onPick={setPicked} />
        ) : (
          <TravelConfirmForm
            picked={picked}
            currentUserAvatar={currentUserAvatar}
            onConfirm={confirmAdd}
            onCancel={() => setPicked(null)}
          />
        )}
      </div>

      <TravelFilters
        cities={cities}
        users={users}
        cityFilter={cityFilter}
        userFilter={userFilter}
        onCityChange={handleCityChange}
        onUserChange={(uid) => {
          setUserFilter(uid);
          try {
            window.umami?.track?.('travel_filter_changed', { type: 'user' });
          } catch {
            /* ignore */
          }
        }}
      />

      {loading && <p className="travel-page__status">Loading recommendations…</p>}
      {pageError && <p className="travel-page__error">{pageError}</p>}

      <TravelMap
        places={visiblePlaces}
        focus={focus}
        renderBubble={(p) => (
          <TravelPlaceBubble
            place={p}
            currentUserId={user?.uid ?? null}
            onEditContribution={editContribution}
            onDeleteContribution={deleteContribution}
          />
        )}
      />
    </div>
  );
}
