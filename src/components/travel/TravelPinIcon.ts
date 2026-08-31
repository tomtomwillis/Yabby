import L from 'leaflet';
import type { PlaceCategory } from './travelTypes';
import { CATEGORY_COLOURS } from './travelTypes';

const PINK_STAR_URL = '/Stickers/avatar_star_pink.webp';

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Pixel offset a pin animates in from, used when a cluster splits apart. */
export interface PinSpawn {
  dx: number;
  dy: number;
}

function spawnAttrs(spawn?: PinSpawn): string {
  if (!spawn) return '';
  return `class="travel-pin travel-pin--single travel-pin--spawn" style="--spawn-x:${spawn.dx.toFixed(1)}px;--spawn-y:${spawn.dy.toFixed(1)}px"`;
}

export function singleAvatarIcon(
  avatarUrl: string,
  category: PlaceCategory = 'other',
  spawn?: PinSpawn,
): L.DivIcon {
  const safeUrl = escapeAttr(avatarUrl || '');
  const colour = CATEGORY_COLOURS[category];
  const html = `
    <div ${spawn ? spawnAttrs(spawn) : 'class="travel-pin travel-pin--single"'}>
      <svg class="travel-pin__droplet" viewBox="0 0 48 64" width="48" height="64" aria-hidden="true">
        <path d="M24 2 C11 2 2 12 2 22 C2 36 20 52 23 62 Q24 63 25 62 C28 52 46 36 46 22 C46 12 37 2 24 2 Z" style="fill:${colour}" />
      </svg>
      <div class="travel-pin__avatar-wrap">
        ${safeUrl
          ? `<img class="travel-pin__avatar" src="${safeUrl}" alt="" onerror="this.style.display='none'"/>`
          : `<div class="travel-pin__avatar travel-pin__avatar--fallback"></div>`}
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'travel-pin-wrapper',
    iconSize: [48, 64],
    iconAnchor: [24, 62],
    popupAnchor: [0, -56],
  });
}

export function multiContributorIcon(
  _count: number,
  category: PlaceCategory = 'other',
  spawn?: PinSpawn,
): L.DivIcon {
  return singleAvatarIcon(PINK_STAR_URL, category, spawn);
}

/** @deprecated use multiContributorIcon */
export function pinkStarIcon(count: number): L.DivIcon {
  const safeCount = Math.max(2, Math.floor(count));
  const html = `
    <div class="travel-pin travel-pin--star">
      <img class="travel-pin__star" src="${PINK_STAR_URL}" alt=""/>
      <span class="travel-pin__badge">${safeCount}</span>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'travel-pin-wrapper',
    iconSize: [52, 52],
    iconAnchor: [26, 48],
    popupAnchor: [0, -44],
  });
}

export function clusterIcon(count: number): L.DivIcon {
  const safeCount = Math.max(2, Math.floor(count));
  const size = safeCount >= 100 ? 60 : safeCount >= 10 ? 52 : 44;
  const html = `
    <div class="travel-cluster" style="width:${size}px;height:${size}px">
      <span class="travel-cluster__count">${safeCount}</span>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'travel-pin-wrapper',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
