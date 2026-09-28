import React, { useEffect, useRef, useState } from "react";
import { coverArtUrl, fetchSubsonicXml } from "../utils/navidrome";
import { useNavidromeCard } from "../utils/useNavidromeCard";
import "./CarouselAlbums.css";

interface Album {
  id: string;
  name: string;
  artist: string;
  coverArt: string;
  year?: string;
  genre?: string;
}

const CarouselAlbums: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { open } = useNavidromeCard();

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Set once a pointer has travelled far enough to count as a throw rather than
  // a tap, so the tile underneath does not open its card on release.
  const draggedRef = useRef(false);

  // The marquee: a rAF loop owns the offset so a drag can take it over
  // mid-flight. Momentum is modelled as an excess on top of the base drift, and
  // decays towards it — so a throw in either direction settles back into the
  // original leftward crawl at the original rate.
  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track || albums.length === 0) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const BASE = reduced ? 0 : -0.018; // px per ms, leftward
    const DECAY = 0.0035;              // excess velocity halves roughly every 200ms
    const DRAG_THRESHOLD = 6;          // px before a press becomes a drag

    let offset = 0;
    let velocity = BASE;
    let copyWidth = track.scrollWidth / 3;
    let hovering = false;
    let dragging = false;
    let coasting = false; // ignore hover-pause until a throw has settled
    let pointerId: number | null = null;
    let startX = 0;
    let lastX = 0;
    let lastMoveAt = 0;
    let frame = 0;
    let previous = performance.now();

    const measure = () => { copyWidth = track.scrollWidth / 3; };
    const observer = new ResizeObserver(measure);
    observer.observe(track);

    const apply = () => {
      if (copyWidth > 0) {
        // Keep the offset inside one copy's width; three copies in the markup
        // mean the seam is always off-screen.
        offset = ((offset % copyWidth) + copyWidth) % copyWidth - copyWidth;
      }
      track.style.transform = `translate3d(${offset}px, 0, 0)`;
    };

    const tick = (now: number) => {
      const dt = Math.min(now - previous, 50);
      previous = now;

      if (!dragging) {
        const excess = velocity - BASE;
        if (Math.abs(excess) > 0.002) {
          velocity = BASE + excess * Math.exp(-DECAY * dt);
        } else {
          velocity = BASE;
          coasting = false;
        }
        if (!(hovering && !coasting)) {
          offset += velocity * dt;
          apply();
        }
      }

      frame = requestAnimationFrame(tick);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (pointerId !== null || e.button !== 0) return;
      pointerId = e.pointerId;
      dragging = true;
      coasting = false;
      draggedRef.current = false;
      startX = e.clientX;
      lastX = e.clientX;
      lastMoveAt = performance.now();
      velocity = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const now = performance.now();
      const dx = e.clientX - lastX;
      const dt = now - lastMoveAt;
      // Capture only once it is a drag: a captured pointer's click lands on the
      // viewport, not the tile, so capturing on press would swallow every tap.
      if (!draggedRef.current && Math.abs(e.clientX - startX) >= DRAG_THRESHOLD) {
        draggedRef.current = true;
        viewport.setPointerCapture(e.pointerId);
        viewport.classList.add('is-dragging');
      }
      if (dt > 0) {
        const instant = dx / dt;
        // Smoothed, so one stuttering frame cannot dominate the throw.
        velocity = velocity * 0.6 + instant * 0.4;
      }
      offset += dx;
      lastX = e.clientX;
      lastMoveAt = now;
      apply();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      dragging = false;
      viewport.classList.remove('is-dragging');
      // A pointer held still before release should not fling.
      if (performance.now() - lastMoveAt > 80) velocity = BASE;
      velocity = Math.max(-4, Math.min(4, velocity));
      coasting = Math.abs(velocity - BASE) > 0.002;
      previous = performance.now();
    };

    const onEnter = () => { hovering = true; };
    const onLeave = () => { hovering = false; };

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    // On window: before the drag threshold the pointer is not captured, so a
    // press released outside the viewport would otherwise leave it stuck.
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    viewport.addEventListener('pointerenter', onEnter);
    viewport.addEventListener('pointerleave', onLeave);
    // Dragging counts as interaction, so the browser's own image drag is noise.
    viewport.addEventListener('dragstart', (e) => e.preventDefault());

    apply();
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      viewport.removeEventListener('pointerenter', onEnter);
      viewport.removeEventListener('pointerleave', onLeave);
    };
  }, [albums]);

  useEffect(() => {
    const fetchAlbums = async () => {
      try {
        setLoading(true);
        setError(null);

        const xmlDoc = await fetchSubsonicXml("getAlbumList", { type: "newest", size: 20 });

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
      onClick={(e) => {
        // detail 0 is a keyboard activation, which a stale drag must not block.
        const keyboard = e.detail === 0;
        if (draggedRef.current && !keyboard) return;
        window.umami?.track('navidrome_card_open', { type: 'album', id: album.id, source: 'carousel' });
        // No cursor to open beside for a keyboard press, so anchor to the tile.
        const rect = e.currentTarget.getBoundingClientRect();
        const at = keyboard ? { x: rect.left, y: rect.bottom } : { x: e.clientX, y: e.clientY };
        open({ target: { type: 'album', id: album.id }, at, pinned: true, follow: false });
      }}
      title={`${album.name} — ${album.artist}${album.year ? ` (${album.year})` : ''}`}
    >
      <img
        src={coverArtUrl(album.coverArt)}
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
    <div className="albums-marquee-frame">
      <div className="albums-marquee" ref={viewportRef}>
        <div className="albums-marquee__track" ref={trackRef}>
          {ticker.map((album, i) => renderTile(album, i))}
        </div>
      </div>
    </div>
  );
};

export default CarouselAlbums;