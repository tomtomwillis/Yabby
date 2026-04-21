import L from 'leaflet';

const PINK_STAR_URL = '/Stickers/avatar_star_pink.webp';

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function singleAvatarIcon(avatarUrl: string): L.DivIcon {
  const safeUrl = escapeAttr(avatarUrl || '');
  const html = `
    <div class="travel-pin travel-pin--single">
      <svg class="travel-pin__droplet" viewBox="0 0 48 64" width="48" height="64" aria-hidden="true">
        <path d="M24 2 C11 2 2 12 2 24 C2 38 20 52 23 62 Q24 63 25 62 C28 52 46 38 46 24 C46 12 37 2 24 2 Z" />
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
