import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { trackedGetDocs as getDocs } from '../../utils/firestoreMetrics';
import { normalizeAvatarPath } from '../../utils/avatarPath';
import { singleAvatarIcon, multiContributorIcon } from './TravelPinIcon';
import { PLACE_CATEGORIES, type Place } from './travelTypes';
import 'leaflet/dist/leaflet.css';
import './TravelMap.css';
import './HomeTravel.css';

const PLACE_LIMIT = 5;

/** New identity on every click, so re-picking the same place re-fires the fly. */
interface Focus {
  id: string;
  lat: number;
  lng: number;
}

/** Short label — "The Old Hairdressers, Glasgow" from a long OSM display name. */
function shortName(place: Place): string {
  return place.displayName.split(',')[0].trim();
}

function categoryLabel(place: Place): string {
  return PLACE_CATEGORIES.find((c) => c.value === place.category)?.label ?? 'Other';
}

/** Slides the map so the opened bubble sits in the middle of it, which puts the
 *  pin at or just below the bottom edge. The frame is only a couple of hundred
 *  pixels tall, so the bubble is measured where it actually landed rather than
 *  derived from the pin's anchor — leaflet adds its own offset and tip height
 *  on top of popupAnchor, and a bubble half off the top is unreadable. */
function centrePopup(map: L.Map, popup: L.Popup) {
  // Two frames, not none: at popupopen leaflet has inserted the element but not
  // finished sizing and placing it, and measuring it then lands the pan tens of
  // pixels short.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = popup.getElement();
      if (!el) return;
      const frame = map.getContainer().getBoundingClientRect();
      const box = el.getBoundingClientRect();
      // panBy shifts the view, so the bubble moves the opposite way by this
      // much — straight from where it is to the middle.
      map.panBy(
        [
          box.left + box.width / 2 - (frame.left + frame.width / 2),
          box.top + box.height / 2 - (frame.top + frame.height / 2),
        ],
        { animate: true, duration: 0.35 },
      );
    }),
  );
}

/** Frames all pins. Unlike the full map's one-shot fit, this re-runs whenever
    the set of places changes, since the widget only ever shows five. */
function FitPlaces({ places }: { places: Place[] }) {
  const map = useMap();
  useEffect(() => {
    if (places.length === 0) return;
    if (places.length === 1) {
      map.setView([places[0].lat, places[0].lng], 8);
      return;
    }
    const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 9 });
  }, [places, map]);
  return null;
}

function Focuser({
  focus,
  markers,
}: {
  focus: Focus | null;
  markers: React.RefObject<Record<string, L.Marker | null>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    // Popups are autoPan: false, so opening one mid-flight would place it off
    // screen — wait for the move to settle first.
    map.once('moveend', () => markers.current[focus.id]?.openPopup());
    map.flyTo([focus.lat, focus.lng], 12, { duration: 0.7 });
  }, [focus, map, markers]);
  return null;
}

/** The five most recently active places, framed on a small map with a text
 *  index beneath it. Reads only the place docs — no contributions, so the
 *  widget costs five reads per home load. */
const HomeTravel: React.FC = () => {
  const [places, setPlaces] = useState<Place[]>([]);
  const [failed, setFailed] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const markers = useRef<Record<string, L.Marker | null>>({});
  const mapRef = useRef<L.Map | null>(null);
  const [draggable] = useState(() => !window.matchMedia('(max-width: 900px)').matches);

  useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(db, 'places'), orderBy('lastActivityAt', 'desc'), limit(PLACE_LIMIT)))
      .then((snap) => {
        if (cancelled) return;
        setPlaces(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Place));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pins = useMemo(
    () =>
      places.map((place) => (
        <Marker
          key={place.id}
          position={[place.lat, place.lng]}
          icon={
            place.contributorCount >= 2
              ? multiContributorIcon(place.contributorCount, place.category)
              : singleAvatarIcon(normalizeAvatarPath(place.firstContributorAvatar), place.category)
          }
          ref={(marker) => {
            markers.current[place.id] = marker;
          }}
          eventHandlers={{
            popupopen: (e) => {
              if (mapRef.current) centrePopup(mapRef.current, e.popup);
            },
          }}
        >
          <Popup
            className="home-travel-popup"
            maxWidth={300}
            minWidth={240}
            autoPan={false}
            keepInView={false}
          >
            <span className="ht-pop-name">{shortName(place)}</span>
            <span className="ht-pop-meta">
              {categoryLabel(place)} · {place.city || place.country}
            </span>
            <span className="ht-pop-meta">
              {place.contributorCount >= 2
                ? `${place.firstContributorUsername} + ${place.contributorCount - 1} more`
                : place.firstContributorUsername}
            </span>
            <Link className="ht-pop-link" to={`/travel?place=${place.id}`}>
              open on the map →
            </Link>
          </Popup>
        </Marker>
      )),
    [places],
  );

  if (failed) return <p className="hp-note">couldn't reach the pins.</p>;
  if (places.length === 0) return <p className="hp-note">finding places…</p>;

  return (
    <div className="home-travel">
      <div className="ht-map">
        <MapContainer
          ref={mapRef}
          center={[20, 0]}
          zoom={2}
          scrollWheelZoom={false}
          /* Mid-page on a phone, a pannable map swallows the swipe that was
             meant to scroll past it. The place buttons below still fly the map
             to each pin, so it stays usable without the drag. Read once —
             leaflet takes its handlers at init and would ignore a later
             change anyway. */
          dragging={draggable}
          worldCopyJump
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <FitPlaces places={places} />
          <Focuser focus={focus} markers={markers} />
          {pins}
        </MapContainer>
      </div>

      <p className="ht-list">
        {places.map((place, i) => (
          <Fragment key={place.id}>
            <button
              type="button"
              className="ht-link"
              onClick={() => {
                setFocus({ id: place.id, lat: place.lat, lng: place.lng });
                window.umami?.track('home_travel_pin', { place: place.id });
              }}
            >
              {shortName(place)}
              {place.city ? `, ${place.city}` : ''}
            </button>
            {i < places.length - 1 && <span aria-hidden="true">; </span>}
          </Fragment>
        ))}
      </p>
    </div>
  );
};

export default HomeTravel;
