import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './TravelMap.css';
import type { Place } from './travelTypes';
import { singleAvatarIcon, pinkStarIcon } from './TravelPinIcon';

interface TravelMapProps {
  places: Place[];
  focus: { lat: number; lng: number; zoom?: number } | null;
  renderBubble: (place: Place) => React.ReactNode;
}

function MapFocuser({ focus }: { focus: TravelMapProps['focus'] }) {
  const map = useMap();
  useEffect(() => {
    if (focus) {
      map.flyTo([focus.lat, focus.lng], focus.zoom ?? 12, { duration: 0.8 });
    }
  }, [focus, map]);
  return null;
}

function FitAllBounds({ places }: { places: Place[] }) {
  const map = useMap();
  useEffect(() => {
    if (places.length === 0) return;
    if (places.length === 1) {
      map.setView([places[0].lat, places[0].lng], 8);
      return;
    }
    const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    // Fit once on the initial render only; subsequent focus changes are handled by MapFocuser
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function TravelMap({ places, focus, renderBubble }: TravelMapProps) {
  const markers = useMemo(() => {
    return places.map((place) => {
      const icon =
        place.contributorCount >= 2
          ? pinkStarIcon(place.contributorCount)
          : singleAvatarIcon(place.firstContributorAvatar);
      return (
        <Marker key={place.id} position={[place.lat, place.lng]} icon={icon}>
          <Popup maxWidth={360} minWidth={280} autoPan>
            {renderBubble(place)}
          </Popup>
        </Marker>
      );
    });
  }, [places, renderBubble]);

  return (
    <div className="travel-map-container">
      <MapContainer center={[20, 0]} zoom={2} scrollWheelZoom worldCopyJump>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitAllBounds places={places} />
        <MapFocuser focus={focus} />
        {markers}
      </MapContainer>
    </div>
  );
}
