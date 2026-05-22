import React, { useEffect, useState } from "react";
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

const CarouselAlbums: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAlbums = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${SERVER_URL}/rest/getAlbumList?type=newest&size=10&format=xml&u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`, 
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

  // Duplicate the list so the CSS keyframe loop joins seamlessly.
  const ticker = [...albums, ...albums];

  const renderTile = (album: Album, i: number) => (
    <a
      key={`${album.id}-${i}`}
      className="albums-marquee__tile"
      href={`${SERVER_URL}/app/#/album/${album.id}/show`}
      target="_blank"
      rel="noopener noreferrer"
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
    </a>
  );

  return (
    <div className="albums-marquee-frame">
      <div className="albums-marquee">
        <div className="albums-marquee__track">
          {ticker.map((album, i) => renderTile(album, i))}
        </div>
      </div>
    </div>
  );
};

export default CarouselAlbums;