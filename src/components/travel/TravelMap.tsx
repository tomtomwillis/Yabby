import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./TravelMap.css";
import type { Place } from "./travelTypes";
import {
  singleAvatarIcon,
  multiContributorIcon,
  clusterIcon,
  type PinSpawn,
} from "./TravelPinIcon";
import { normalizeAvatarPath } from "../../utils/avatarPath";

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

/** Pins closer than this many screen pixels at the current zoom get grouped. */
const CLUSTER_RADIUS_PX = 64;

/** Fewer nearby pins than this stay as individual pins rather than becoming a group. */
const MIN_CLUSTER_SIZE = 6;

/** Pins never animate in from further than this, so a big split stays legible. */
const MAX_SPAWN_PX = 220;

interface Cluster {
  key: string;
  lat: number;
  lng: number;
  places: Place[];
}

function clusterPlaces(map: L.Map, places: Place[], zoom: number): Cluster[] {
  const points = places.map((place) => ({
    place,
    pt: map.project([place.lat, place.lng], zoom),
  }));
  const taken = new Array(points.length).fill(false);
  const clusters: Cluster[] = [];

  for (let i = 0; i < points.length; i++) {
    if (taken[i]) continue;
    taken[i] = true;
    const members = [points[i].place];
    for (let j = i + 1; j < points.length; j++) {
      if (taken[j]) continue;
      if (points[i].pt.distanceTo(points[j].pt) <= CLUSTER_RADIUS_PX) {
        taken[j] = true;
        members.push(points[j].place);
      }
    }
    if (members.length < MIN_CLUSTER_SIZE) {
      for (const place of members) {
        clusters.push({
          key: place.id,
          lat: place.lat,
          lng: place.lng,
          places: [place],
        });
      }
      continue;
    }
    const lat = members.reduce((sum, p) => sum + p.lat, 0) / members.length;
    const lng = members.reduce((sum, p) => sum + p.lng, 0) / members.length;
    clusters.push({
      key: `${members[0].id}:${members.length}`,
      lat,
      lng,
      places: members,
    });
  }

  return clusters;
}

/**
 * Where each pin should animate in from: the centre of the group it belonged to
 * before this zoom step, in pixels relative to its own final position.
 */
function spawnOffsets(
  map: L.Map,
  clusters: Cluster[],
  previous: { zoom: number; clusters: Cluster[] } | null,
  zoom: number,
): Map<string, PinSpawn> {
  const offsets = new Map<string, PinSpawn>();
  if (!previous || zoom <= previous.zoom) return offsets;

  const wasGrouped = new Map<string, Cluster>();
  for (const cluster of previous.clusters) {
    if (cluster.places.length < 2) continue;
    for (const place of cluster.places) wasGrouped.set(place.id, cluster);
  }
  if (wasGrouped.size === 0) return offsets;

  for (const cluster of clusters) {
    if (cluster.places.length > 1) continue;
    const place = cluster.places[0];
    const old = wasGrouped.get(place.id);
    if (!old) continue;
    const from = map.project([old.lat, old.lng], zoom);
    const to = map.project([place.lat, place.lng], zoom);
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 2) continue;
    const scale = distance > MAX_SPAWN_PX ? MAX_SPAWN_PX / distance : 1;
    offsets.set(place.id, { dx: dx * scale, dy: dy * scale });
  }

  return offsets;
}

function ClusteredMarkers({
  places,
  renderBubble,
  popupMaxWidth,
  popupMinWidth,
}: {
  places: Place[];
  renderBubble: (place: Place) => React.ReactNode;
  popupMaxWidth: number;
  popupMinWidth: number;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  const previousRef = useRef<{ zoom: number; clusters: Cluster[] } | null>(
    null,
  );

  const { clusters, spawns } = useMemo(() => {
    const next = clusterPlaces(map, places, zoom);
    return {
      clusters: next,
      spawns: spawnOffsets(map, next, previousRef.current, zoom),
    };
  }, [map, places, zoom]);

  useEffect(() => {
    previousRef.current = { zoom, clusters };
  }, [zoom, clusters]);

  const markers = useMemo(() => {
    return clusters.map((cluster) => {
      if (cluster.places.length > 1) {
        return (
          <Marker
            key={`c-${cluster.key}`}
            position={[cluster.lat, cluster.lng]}
            icon={clusterIcon(cluster.places.length)}
            eventHandlers={{
              click: () => {
                const bounds = L.latLngBounds(
                  cluster.places.map((p) => [p.lat, p.lng] as [number, number]),
                );
                if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
                  map.flyTo(
                    [cluster.lat, cluster.lng],
                    Math.min(zoom + 3, map.getMaxZoom()),
                  );
                } else {
                  map.flyToBounds(bounds, {
                    padding: [80, 80],
                    maxZoom: map.getMaxZoom(),
                  });
                }
              },
            }}
          />
        );
      }

      const place = cluster.places[0];
      const spawn = spawns.get(place.id);
      const icon =
        place.contributorCount >= 2
          ? multiContributorIcon(place.contributorCount, place.category, spawn)
          : singleAvatarIcon(
              normalizeAvatarPath(place.firstContributorAvatar),
              place.category,
              spawn,
            );
      return (
        <Marker key={place.id} position={[place.lat, place.lng]} icon={icon}>
          <Popup
            maxWidth={popupMaxWidth}
            minWidth={popupMinWidth}
            autoPan={false}
            keepInView={false}
            className="travel-bubble-popup"
          >
            {renderBubble(place)}
          </Popup>
        </Marker>
      );
    });
  }, [clusters, spawns, map, zoom, renderBubble, popupMaxWidth, popupMinWidth]);

  return <>{markers}</>;
}

function MapFocuser({ focus }: { focus: TravelMapProps["focus"] }) {
  const map = useMap();
  useEffect(() => {
    if (focus) {
      map.flyTo([focus.lat, focus.lng], focus.zoom ?? 12, { duration: 0.8 });
    }
  }, [focus, map]);
  return null;
}

function MapMover({
  onViewChange,
}: {
  onViewChange?: (v: TravelMapView) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!onViewChange) return;
    const emit = () => {
      const c = map.getCenter();
      onViewChange({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    };
    emit();
    map.on("moveend", emit);
    return () => {
      map.off("moveend", emit);
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
    const bounds = L.latLngBounds(
      places.map((p) => [p.lat, p.lng] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 10 });
  }, [places, map, fitted]);
  return null;
}

export default function TravelMap({
  places,
  focus,
  renderBubble,
  onViewChange,
}: TravelMapProps) {
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
  const popupMaxWidth = isMobile ? Math.floor(window.innerWidth * 0.68) : 360;
  const popupMinWidth = isMobile ? 0 : 280;

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
        <ClusteredMarkers
          places={places}
          renderBubble={renderBubble}
          popupMaxWidth={popupMaxWidth}
          popupMinWidth={popupMinWidth}
        />
      </MapContainer>
    </div>
  );
}
