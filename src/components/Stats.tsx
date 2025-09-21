import React, { useEffect, useState } from "react";
import "./Stats.css";

const Stats: React.FC = () => {
  const [totalAlbums, setTotalAlbums] = useState(0);
  const [totalSongs, setTotalSongs] = useState(0);
  const [songOfTheDay, setSongOfTheDay] = useState<{
    title: string;
    artist: string;
    album: string;
    url: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asciiPose, setAsciiPose] = useState(0);

  // Helper function to get API credentials
  const getApiConfig = () => {
    return {
      serverUrl: "https://music.yabbyville.xyz",
      username: import.meta.env.VITE_NAVIDROME_API_USERNAME,
      password: import.meta.env.VITE_NAVIDROME_API_PASSWORD,
      appName: "YabbyVilleClient",
    };
  };

  const fetchLibraryStats = async () => {
    const { serverUrl, username, password, appName } = getApiConfig();

    try {
      // Method 1: Try to get count with minimal data first
      let albumCount = await getAlbumCountEfficient(serverUrl, username, password, appName);
      let songCount = 0;

      // If we couldn't get an efficient count, fall back to paginated approach
      if (albumCount === -1) {
        const stats = await getAlbumCountPaginated(serverUrl, username, password, appName);
        albumCount = stats.albumCount;
        songCount = stats.songCount;
      } else {
        // If we got album count efficiently, we still need song count
        songCount = await getSongCountFromAlbums(serverUrl, username, password, appName);
      }

      setTotalAlbums(albumCount);
      setTotalSongs(songCount);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An unknown error occurred";
      console.error("Error fetching stats:", errorMessage);
      setError(errorMessage);
    }
  };

  // Method 1: Try to get count with minimal data transfer
  const getAlbumCountEfficient = async (
    serverUrl: string,
    username: string,
    password: string,
    appName: string
  ): Promise<number> => {
    try {
      // Try with size=0 to see if we get metadata with total count
      const response = await fetch(
        `${serverUrl}/rest/getAlbumList2?u=${username}&p=${password}&v=1.16.1&c=${appName}&f=json&type=alphabeticalByName&size=0`,
        {
          headers: {
            Authorization: "Basic " + btoa(`${username}:${password}`),
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data["subsonic-response"].status === "ok") {
        const albumList = data["subsonic-response"].albumList2;
        
        // Check if response includes total count metadata
        if (albumList.totalCount !== undefined) {
          return albumList.totalCount;
        }
        
        // If size=0 returns actual albums, count them
        if (albumList.album && Array.isArray(albumList.album)) {
          return albumList.album.length;
        }
      }
      
      return -1; // Indicates we need to use fallback method
    } catch (error) {
      console.log("Efficient method failed, falling back to paginated approach");
      return -1;
    }
  };

  // Method 2: Paginated approach for accurate counting
  const getAlbumCountPaginated = async (
    serverUrl: string,
    username: string,
    password: string,
    appName: string
  ): Promise<{ albumCount: number; songCount: number }> => {
    let totalAlbums = 0;
    let totalSongs = 0;
    let offset = 0;
    const pageSize = 500; // Reasonable page size
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `${serverUrl}/rest/getAlbumList2?u=${username}&p=${password}&v=1.16.1&c=${appName}&f=json&type=alphabeticalByName&size=${pageSize}&offset=${offset}`,
        {
          headers: {
            Authorization: "Basic " + btoa(`${username}:${password}`),
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data["subsonic-response"].status === "ok") {
        const albums = data["subsonic-response"].albumList2.album || [];
        
        if (albums.length === 0) {
          hasMore = false;
        } else {
          totalAlbums += albums.length;
          
          // Sum up song counts from this batch
          const batchSongCount = albums.reduce(
            (sum: number, album: any) => sum + (album.songCount || 0),
            0
          );
          totalSongs += batchSongCount;
          
          // If we got fewer albums than requested, we've reached the end
          if (albums.length < pageSize) {
            hasMore = false;
          } else {
            offset += pageSize;
          }
        }
      } else {
        const errorMessage =
          data["subsonic-response"].error?.message || "Unknown API error";
        throw new Error(errorMessage);
      }
    }

    return { albumCount: totalAlbums, songCount: totalSongs };
  };

  // Get song count when we have album count but need song totals
  const getSongCountFromAlbums = async (
    serverUrl: string,
    username: string,
    password: string,
    appName: string
  ): Promise<number> => {
    // For now, we'll use the paginated approach to get song counts too
    // In a real implementation, you might want to use other endpoints
    const stats = await getAlbumCountPaginated(serverUrl, username, password, appName);
    return stats.songCount;
  };

  const fetchSongOfTheDay = async () => {
    const { serverUrl, username, password, appName } = getApiConfig();

    const storedSong = localStorage.getItem("songOfTheDay");
    const storedDate = localStorage.getItem("songOfTheDayDate");
    const today = new Date().toISOString().split("T")[0];

    if (storedSong && storedDate === today) {
      setSongOfTheDay(JSON.parse(storedSong));
      return;
    }

    try {
      const response = await fetch(
        `${serverUrl}/rest/getRandomSongs?u=${username}&p=${password}&v=1.16.1&c=${appName}&f=json&size=1`,
        {
          headers: {
            Authorization: "Basic " + btoa(`${username}:${password}`),
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("API Response:", data);

      if (data["subsonic-response"].status === "ok") {
        const song = data["subsonic-response"].randomSongs.song[0];
        console.log("Selected Song:", song);

        const albumId = song.albumId || song.album?.id;
        if (!albumId) {
          throw new Error("Album ID is missing in the API response.");
        }

        const songData = {
          title: song.title,
          artist: song.artist,
          album: song.album,
          url: `https://music.yabbyville.xyz/app/#/album/${albumId}/show`,
        };

        setSongOfTheDay(songData);

        localStorage.setItem("songOfTheDay", JSON.stringify(songData));
        localStorage.setItem("songOfTheDayDate", today);
      } else {
        const errorMessage =
          data["subsonic-response"].error?.message || "Unknown API error";
        throw new Error(errorMessage);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An unknown error occurred";
      console.error("Error fetching song of the day:", errorMessage);
      setError(errorMessage);
    }
  };

  useEffect(() => {
    fetchLibraryStats();
    fetchSongOfTheDay();

    // ASCII dancing logic
    const interval = setInterval(() => {
      setAsciiPose((prevPose) => (prevPose + 1) % 2);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div>
        <p>Error loading stats: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  // ASCII poses
  const asciiMan = [
    `
      ___
    d(♥_♥)b    ♬·¯·♩¸¸♪·¯·♫¸ 

    `,
    `
      ___
    d(♥.♥)b    ♬.-.♩.-♪·_,♫

    `,
  ];

  return (
    <div className="stats-container">
      <p className="normal-text">💿 Total Albums: {totalAlbums}</p>
      <p className="normal-text">🎶 Total Songs: {totalSongs}</p>
      {songOfTheDay && (
        <p className="normal-text">
          🎵 Song of the Day:{" "}
          <a href={songOfTheDay.url} target="_blank" rel="noopener noreferrer">
            {songOfTheDay.title} - {songOfTheDay.artist} - {songOfTheDay.album}
          </a>
        </p>
      )}
      <pre className="ascii-art">{asciiMan[asciiPose]}</pre>
    </div>
  );
};

export default Stats;