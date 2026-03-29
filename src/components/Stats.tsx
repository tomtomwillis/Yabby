import React, { useEffect, useState } from "react";
import "./Stats.css";

interface GitHubStats {
  totalCommits: number;
  lastCommitAuthor: string;
  lastCommitDate: string;
  lastCommitMessage: string;
}

const GITHUB_CACHE_KEY = "githubStats";
const GITHUB_CACHE_TS_KEY = "githubStatsTimestamp";
const GITHUB_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const Stats: React.FC = () => {
  const [totalAlbums, setTotalAlbums] = useState(0);
  const [totalSongs, setTotalSongs] = useState(0);
  const [songOfTheDay, setSongOfTheDay] = useState<{
    title: string;
    artist: string;
    album: string;
    url: string;
  } | null>(null);
  const [githubStats, setGithubStats] = useState<GitHubStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Helper function to get API credentials
  const getApiConfig = () => {
    return {
      serverUrl: import.meta.env.VITE_NAVIDROME_SERVER_URL,
      username: import.meta.env.VITE_NAVIDROME_API_USERNAME,
      password: import.meta.env.VITE_NAVIDROME_API_PASSWORD,
      appName: import.meta.env.VITE_NAVIDROME_CLIENT_ID,
    };
  };

  const fetchLibraryStats = async () => {
    const { serverUrl, username, password, appName } = getApiConfig();

    try {
      let albumCount = await getAlbumCountEfficient(serverUrl, username, password, appName);
      let songCount = 0;

      if (albumCount === -1) {
        const stats = await getAlbumCountPaginated(serverUrl, username, password, appName);
        albumCount = stats.albumCount;
        songCount = stats.songCount;
      } else {
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

  const getAlbumCountEfficient = async (
    serverUrl: string,
    username: string,
    password: string,
    appName: string
  ): Promise<number> => {
    try {
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

        if (albumList.totalCount !== undefined) {
          return albumList.totalCount;
        }

        if (albumList.album && Array.isArray(albumList.album)) {
          return albumList.album.length;
        }
      }

      return -1;
    } catch (error) {
      console.log("Efficient method failed, falling back to paginated approach");
      return -1;
    }
  };

  const getAlbumCountPaginated = async (
    serverUrl: string,
    username: string,
    password: string,
    appName: string
  ): Promise<{ albumCount: number; songCount: number }> => {
    let totalAlbums = 0;
    let totalSongs = 0;
    let offset = 0;
    const pageSize = 500;
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

          const batchSongCount = albums.reduce(
            (sum: number, album: any) => sum + (album.songCount || 0),
            0
          );
          totalSongs += batchSongCount;

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

  const getSongCountFromAlbums = async (
    serverUrl: string,
    username: string,
    password: string,
    appName: string
  ): Promise<number> => {
    const stats = await getAlbumCountPaginated(serverUrl, username, password, appName);
    return stats.songCount;
  };

  const formatCommitDate = (isoDate: string): string => {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Simple hash function to convert a string to a positive integer
  const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  };

  const getDeterministicSongOfTheDay = async (
    serverUrl: string,
    username: string,
    password: string,
    appName: string
  ): Promise<{
    title: string;
    artist: string;
    album: string;
    url: string;
  }> => {
    // Get current date as string (YYYY-MM-DD)
    const today = new Date().toISOString().split("T")[0];

    // Generate deterministic indices from date
    const dateHash = hashString(today);
    const albumIndex = dateHash % totalAlbums;

    // Fetch the album at the calculated index using pagination
    const pageSize = 500;
    const targetPage = Math.floor(albumIndex / pageSize);
    const indexInPage = albumIndex % pageSize;

    const albumListResponse = await fetch(
      `${serverUrl}/rest/getAlbumList2?u=${username}&p=${password}&v=1.16.1&c=${appName}&f=json&type=alphabeticalByName&size=${pageSize}&offset=${targetPage * pageSize}`,
      {
        headers: {
          Authorization: "Basic " + btoa(`${username}:${password}`),
        },
      }
    );

    if (!albumListResponse.ok) {
      throw new Error(`HTTP error! status: ${albumListResponse.status}`);
    }

    const albumListData = await albumListResponse.json();

    if (albumListData["subsonic-response"].status !== "ok") {
      throw new Error("Failed to fetch album list");
    }

    const albums = albumListData["subsonic-response"].albumList2.album || [];

    if (albums.length === 0 || indexInPage >= albums.length) {
      throw new Error("Album index out of range");
    }

    const selectedAlbum = albums[indexInPage];

    // Fetch the album details to get the track list
    const albumResponse = await fetch(
      `${serverUrl}/rest/getAlbum?u=${username}&p=${password}&v=1.16.1&c=${appName}&f=json&id=${selectedAlbum.id}`,
      {
        headers: {
          Authorization: "Basic " + btoa(`${username}:${password}`),
        },
      }
    );

    if (!albumResponse.ok) {
      throw new Error(`HTTP error! status: ${albumResponse.status}`);
    }

    const albumData = await albumResponse.json();

    if (albumData["subsonic-response"].status !== "ok") {
      throw new Error("Failed to fetch album details");
    }

    const album = albumData["subsonic-response"].album;
    const songs = album.song || [];

    if (songs.length === 0) {
      throw new Error("No songs in selected album");
    }

    // Use a secondary hash to select a track from the album
    const trackHash = hashString(today + "_track");
    const trackIndex = trackHash % songs.length;
    const selectedSong = songs[trackIndex];

    return {
      title: selectedSong.title,
      artist: selectedSong.artist,
      album: album.name,
      url: `${serverUrl}/app/#/album/${album.id}/show`,
    };
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
      // Try deterministic selection first
      console.log("Attempting deterministic song selection...");
      const songData = await getDeterministicSongOfTheDay(
        serverUrl,
        username,
        password,
        appName
      );

      console.log("Deterministic song selected:", songData);
      setSongOfTheDay(songData);

      localStorage.setItem("songOfTheDay", JSON.stringify(songData));
      localStorage.setItem("songOfTheDayDate", today);
    } catch (deterministicErr) {
      // Fall back to random song selection if deterministic fails
      console.log(
        "Deterministic selection failed, falling back to random:",
        deterministicErr instanceof Error ? deterministicErr.message : deterministicErr
      );

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
        console.log("Random API Response:", data);

        if (data["subsonic-response"].status === "ok") {
          const song = data["subsonic-response"].randomSongs.song[0];
          console.log("Random Song Selected:", song);

          const albumId = song.albumId || song.album?.id;
          if (!albumId) {
            throw new Error("Album ID is missing in the API response.");
          }

          const songData = {
            title: song.title,
            artist: song.artist,
            album: song.album,
            url: `${serverUrl}/app/#/album/${albumId}/show`,
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
    }
  };

  const fetchGitHubStats = async () => {
    // Check cache first
    const cachedData = localStorage.getItem(GITHUB_CACHE_KEY);
    const cachedTimestamp = localStorage.getItem(GITHUB_CACHE_TS_KEY);

    if (cachedData && cachedTimestamp) {
      const age = Date.now() - parseInt(cachedTimestamp, 10);
      if (age < GITHUB_CACHE_TTL) {
        setGithubStats(JSON.parse(cachedData));
        return;
      }
    }

    try {
      const response = await fetch(
        "https://api.github.com/repos/tomtomwillis/Yabby/commits?per_page=1"
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      // Extract total commits from Link header pagination
      let totalCommits = 0;
      const linkHeader = response.headers.get("Link");
      if (linkHeader) {
        const lastMatch = linkHeader.match(/&page=(\d+)>;\s*rel="last"/);
        if (lastMatch) {
          totalCommits = parseInt(lastMatch[1], 10);
        }
      }

      const commits = await response.json();
      if (commits.length > 0) {
        const latest = commits[0];
        const stats: GitHubStats = {
          totalCommits,
          lastCommitAuthor: latest.author?.login || latest.commit.author.name,
          lastCommitDate: latest.commit.author.date,
          lastCommitMessage: latest.commit.message,
        };

        setGithubStats(stats);
        localStorage.setItem(GITHUB_CACHE_KEY, JSON.stringify(stats));
        localStorage.setItem(GITHUB_CACHE_TS_KEY, Date.now().toString());
      }
    } catch (err) {
      console.error("Error fetching GitHub stats:", err instanceof Error ? err.message : err);
      // Non-critical — don't set error state, just skip the section
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        await Promise.all([fetchLibraryStats(), fetchSongOfTheDay(), fetchGitHubStats()]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    return () => {};
  }, []);

  if (error) {
    return (
      <div>
        <p>Error loading stats: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="stats-container">
        <p className="normal-text">Loading stats...</p>
      </div>
    );
  }

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

      {githubStats && (
        <div className="github-stats">
          <p className="github-stats-title">From the Workshop</p>
          <p className="github-latest-heading">Latest Commit</p>
          <p className="normal-text">
            📝 <span className="github-commit-message">"{githubStats.lastCommitMessage}"</span> — by ⭐{githubStats.lastCommitAuthor}⭐, {formatCommitDate(githubStats.lastCommitDate)}
          </p>
          {githubStats.totalCommits > 0 && (
            <p className="normal-text">🔧 Total Commits: {githubStats.totalCommits}</p>
          )}
          <a
            className="github-show-more"
            href="https://github.com/tomtomwillis/Yabby/commits/main"
            target="_blank"
            rel="noopener noreferrer"
          >
            Show more →
          </a>
        </div>
      )}
    </div>
  );
};

export default Stats;