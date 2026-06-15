import React, { useEffect, useState } from "react";
import Carousel from "./basic/Carousel";
import "./basic/Carousel.css";
import "./CarouselAlbums.css";
import { fetchSubsonicXml, coverArtUrl, NAVIDROME_SERVER_URL } from "../utils/navidrome";

interface Album {
  id: string;
  name: string;
  artist: string;
  coverArt: string;
  year?: string;
  genre?: string;
}

// Module-level cache — cleared on page refresh, shared across mounts within the same session.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cachedAlbums: Album[] | null = null;
let cacheTimestamp = 0;

const CarouselAlbums: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAlbums = async () => {
      if (cachedAlbums && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
        setAlbums(cachedAlbums);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const xmlDoc = await fetchSubsonicXml("getAlbumList", { type: "newest", size: 10 });

        const albumElements = Array.from(xmlDoc.getElementsByTagName("album"));

        if (albumElements.length === 0) {
          throw new Error("No albums found in response");
        }

        const albumList: Album[] = albumElements.map((album) => ({
          id: album.getAttribute("id") || "",
          name: album.getAttribute("name") || album.getAttribute("title") || "Unknown Album",
          artist: album.getAttribute("artist") || album.getAttribute("displayArtist") || "Unknown Artist",
          coverArt: album.getAttribute("coverArt") || "",
          year: album.getAttribute("year") || "",
          genre: album.getAttribute("genre") || "",
        }));

        cachedAlbums = albumList;
        cacheTimestamp = Date.now();
        setAlbums(albumList);
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
      <div className="carousel">
        <p>Loading albums...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="carousel">
        <p>Error loading albums: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div className="carousel">
        <p>No albums found</p>
      </div>
    );
  }

  const slides = albums.map((album) => (
    <div key={album.id} className="carousel__slide">
      <a
        href={`${NAVIDROME_SERVER_URL}/app/#/album/${album.id}/show`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src={coverArtUrl(album.coverArt)}
          alt={album.name}
          className="carousel__slide-image"
          loading="lazy"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src =
              "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+";
          }}
        />
        <div className="carousel__slide-info">
          <div className="carousel__slide-text">
            {album.name}
            <br />
            {album.artist}
            <br />
            {album.year || ""}
          </div>
        </div>
      </a>
    </div>
  ));

  return (
    <div className="carousel-albums">
      <Carousel slides={slides} loop autoplay />
    </div>
  );
};

export default CarouselAlbums;