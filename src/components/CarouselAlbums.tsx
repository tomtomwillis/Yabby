import React, { useCallback, useEffect, useRef, useState } from "react";
import AnchoredBubble from "./basic/AnchoredBubble";
import { NAVIDROME_SERVER_URL } from "../utils/navidrome";
import {
  formatTime,
  loadAlbumTracks,
  usePlayerActions,
  usePlayerState,
  type PlayerTrack,
} from "../utils/usePlayer";
// The bubble's track list reuses the sticker player's sp- rows.
import "./stickerPlayer.css";
import "./CarouselAlbums.css";

const API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
const API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
const SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
const CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID; 

interface Album {
  id: string;
  name: string;
  artist: string;
  coverArt: string;
  year?: string;
  genre?: string;
}

/** What the open bubble is showing. Keyed by tile rather than album id — the
 *  list repeats for the marquee loop, so the same album appears more than once. */
interface OpenTile {
  key: string;
  album: Album;
  anchor: HTMLElement;
}

/** The bubble's contents. Separate from the ticker so the player subscription —
 *  which updates several times a second while a track runs — cannot re-render
 *  the marquee underneath it. */
const AlbumBubbleBody: React.FC<{ album: Album }> = ({ album }) => {
  const [tracks, setTracks] = useState<PlayerTrack[]>([]);
  const [failed, setFailed] = useState(false);
  const { album: playingAlbum, index: playingIndex } = usePlayerState();
  const { playAlbum } = usePlayerActions();

  // Re-requesting hits navidromeCards' promise cache, so an album already
  // opened once costs nothing.
  useEffect(() => {
    let cancelled = false;
    setTracks([]);
    setFailed(false);
    loadAlbumTracks(album.id)
      .then((loaded) => { if (!cancelled) setTracks(loaded); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [album.id]);

  const playingHere = playingAlbum?.id === album.id;

  return (
    <>
      <h3 className="am-bubble__title">{album.name}</h3>
      <p className="am-bubble__artist">{album.artist}</p>

      {failed && <p className="sp-status">Could not load tracks</p>}
      {!failed && tracks.length === 0 && <p className="sp-status">loading tracks…</p>}

      <ol className="sp-tracks">
        {tracks.map((track, i) => {
          const isCurrent = playingHere && playingIndex === i;
          return (
            <li key={track.id}>
              <button
                className={isCurrent ? 'sp-track is-current' : 'sp-track'}
                aria-current={isCurrent || undefined}
                onClick={() =>
                  playAlbum({ id: album.id, title: album.name, artist: album.artist }, track.id)
                }
              >
                <span className="sp-track-cue" aria-hidden="true">{isCurrent ? '▶' : ' '}</span>
                <span className="sp-track-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="sp-track-title">{track.title}</span>
                <span className="sp-track-dur">{formatTime(track.duration ?? 0)}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <a
        className="am-bubble__link"
        href={`${NAVIDROME_SERVER_URL}/app/#/album/${album.id}/show`}
        target="_blank"
        rel="noopener noreferrer"
      >
        [ Open in Navidrome ]
      </a>
    </>
  );
};

const CarouselAlbums: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<OpenTile | null>(null);

  const closeBubble = useCallback(() => setOpen(null), []);

  useEffect(() => {
    const fetchAlbums = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${SERVER_URL}/rest/getAlbumList?type=newest&size=20&format=xml&u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`,
          {
            headers: {
              Authorization: "Basic " + btoa(`${API_USERNAME}:${API_PASSWORD}`),
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "application/xml");

        const parserError = xmlDoc.querySelector("parsererror");
        if (parserError) {
          throw new Error("XML parsing error: " + parserError.textContent);
        }

        const subsonicResponse = xmlDoc.querySelector("subsonic-response");
        if (subsonicResponse?.getAttribute("status") === "failed") {
          const errorElement = xmlDoc.querySelector("error");
          const errorMessage =
            errorElement?.getAttribute("message") || "Unknown API error";
          throw new Error(`API Error: ${errorMessage}`);
        }

        const albumElements = Array.from(xmlDoc.getElementsByTagName("album"));

        if (albumElements.length === 0) {
          throw new Error("No albums found in response");
        }

        const albums: Album[] = albumElements.map((album) => ({
          id: album.getAttribute("id") || "",
          name: album.getAttribute("name") || album.getAttribute("title") || "Unknown Album",
          artist: album.getAttribute("artist") || album.getAttribute("displayArtist") || "Unknown Artist",
          coverArt: album.getAttribute("coverArt") || "",
          year: album.getAttribute("year") || "",
          genre: album.getAttribute("genre") || "",
        }));

        setAlbums(albums);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "An unknown error occurred";
        console.error("Error fetching albums:", errorMessage);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchAlbums();
  }, []);

  if (loading) {
    return (
      <div className="albums-marquee-frame">
        <p>Loading albums...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="albums-marquee-frame">
        <p>Error loading albums: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div className="albums-marquee-frame">
        <p>No albums found</p>
      </div>
    );
  }

  // Three copies, not two. The keyframe scrolls exactly one copy's width, so a
  // copy narrower than the frame runs off the end and leaves a gap — with three
  // there are always two copies' worth of tiles to the right of the start.
  const ticker = [...albums, ...albums, ...albums];

  const renderTile = (album: Album, i: number) => (
    <button
      key={`${album.id}-${i}`}
      type="button"
      className="albums-marquee__tile"
      onClick={(e) => setOpen({ key: `${album.id}-${i}`, album, anchor: e.currentTarget })}
      title={`${album.name} — ${album.artist}${album.year ? ` (${album.year})` : ''}`}
    >
      <img
        src={`${SERVER_URL}/rest/getCoverArt?id=${album.coverArt}&u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`}
        alt={album.name}
        className="albums-marquee__img"
        loading="lazy"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.src =
            "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+";
        }}
      />
      <span className="albums-marquee__caption">
        <strong>{album.name}</strong>
        <em>{album.artist}</em>
      </span>
    </button>
  );

  return (
    <div className="albums-marquee-frame" ref={frameRef}>
      {/* Frozen while a bubble is open, otherwise the tile it points at slides
          out from under it. */}
      <div className={`albums-marquee${open ? ' is-frozen' : ''}`}>
        <div className="albums-marquee__track">
          {ticker.map((album, i) => renderTile(album, i))}
        </div>
      </div>

      {open && (
        <AnchoredBubble
          anchor={open.anchor}
          container={frameRef.current}
          placement="above"
          onClose={closeBubble}
        >
          <AlbumBubbleBody album={open.album} />
        </AnchoredBubble>
      )}
    </div>
  );
};

export default CarouselAlbums;