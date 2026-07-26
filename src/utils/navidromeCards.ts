import { fetchSubsonicJson } from './navidrome';

export interface CardTrack {
  id: string;
  title: string;
  duration?: number;
  track?: number;
  discNumber?: number;
}

export interface CardAlbum {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  coverArt?: string;
  year?: number;
  label?: string;
}

export interface CardAlbumDetail extends CardAlbum {
  tracks: CardTrack[];
}

export interface CardArtist {
  id: string;
  name: string;
  coverArt?: string;
  albums: CardAlbum[];
}

// Caches the promise rather than the result, so a hover card, a track click and
// the player's own queue load share one request instead of racing. Same idiom
// as the album cache this replaced in useStickerPlayer.
const albumCache = new Map<string, Promise<CardAlbumDetail>>();
const artistCache = new Map<string, Promise<CardArtist>>();

// recordLabels and originalReleaseDate are OpenSubsonic fields — present on
// Navidrome, absent on older servers, so both stay optional and unrendered
// when missing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCardAlbum(album: any): CardAlbum {
  return {
    id: album.id,
    name: album.name,
    artist: album.artist,
    artistId: album.artistId,
    coverArt: album.coverArt,
    year: album.year ?? album.originalReleaseDate?.year,
    label: album.recordLabels?.[0]?.name,
  };
}

export function loadAlbumCard(albumId: string): Promise<CardAlbumDetail> {
  const cached = albumCache.get(albumId);
  if (cached) return cached;

  const pending = fetchSubsonicJson('getAlbum', { id: albumId })
    .then((data) => {
      const album = data.album || {};
      const songs = album.song || [];
      return {
        ...toCardAlbum(album),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tracks: songs.map((song: any) => ({
          id: song.id,
          title: song.title,
          duration: song.duration,
          track: song.track,
          discNumber: song.discNumber,
        })),
      } as CardAlbumDetail;
    })
    .catch((err) => {
      albumCache.delete(albumId);
      throw err;
    });

  albumCache.set(albumId, pending);
  return pending;
}

export function loadArtistCard(artistId: string): Promise<CardArtist> {
  const cached = artistCache.get(artistId);
  if (cached) return cached;

  const pending = fetchSubsonicJson('getArtist', { id: artistId })
    .then((data) => {
      const artist = data.artist || {};
      const albums: CardAlbum[] = (artist.album || []).map(toCardAlbum);
      // Newest first, then alphabetical so undated releases still order stably.
      albums.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name));
      return {
        id: artist.id,
        name: artist.name,
        coverArt: artist.coverArt,
        albums,
      } as CardArtist;
    })
    .catch((err) => {
      artistCache.delete(artistId);
      throw err;
    });

  artistCache.set(artistId, pending);
  return pending;
}
