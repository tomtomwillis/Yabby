import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './TravelMap.css';
import type { Place } from './travelTypes';
import { singleAvatarIcon, multiContributorIcon } from './TravelPinIcon';

export interface TravelMapView {
  lat: number;
  lng: number;
  zoom: number;
}

interface TravelMapProps {
  places: Place[];
  focus: { lat: number; lng: number; zoom?: number } | null;
  renderBubble: (place: Place) => React.ReactNode;
  onViewChange?: (view: TravelMapView) => void;
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

function MapMover({ onViewChange }: { onViewChange?: (v: TravelMapView) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!onViewChange) return;
    const emit = () => {
      const c = map.getCenter();
      onViewChange({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    };
    emit();
    map.on('moveend', emit);
    return () => {
      map.off('moveend', emit);
    };
  }, [map, onViewChange]);
  return null;
}

function FitAllBounds({ places }: { places: Place[] }) {
  const map = useMap();
  const fitted = useMemo(() => ({ done: false }), []);
  useEffect(() => {
    if (fitted.done || places.length === 0) return;
    fitted.done = true;
    if (places.length === 1) {
      map.setView([places[0].lat, places[0].lng], 8);
      return;
    }
    const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 10 });
  }, [places, map, fitted]);
  return null;
}

export default function TravelMap({ places, focus, renderBubble, onViewChange }: TravelMapProps) {
  const markers = useMemo(() => {
    return places.map((place) => {
      const icon =
        place.contributorCount >= 2
          ? multiContributorIcon(place.contributorCount, place.category)
          : singleAvatarIcon(place.firstContributorAvatar, place.category);
      return (
        <Marker key={place.id} position={[place.lat, place.lng]} icon={icon}>
          <Popup maxWidth={360} minWidth={280} autoPan className="travel-bubble-popup">
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
        <MapMover onViewChange={onViewChange} />
        {markers}
      </MapContainer>
    </div>
  );
}
