import React, { useEffect, useState } from "react";
import { NAVIDROME_SERVER_URL } from "../utils/navidrome";
import { usePlayerActions } from "../utils/usePlayer";
import "./Stats.css";

const albumLink = (id: string) => `${NAVIDROME_SERVER_URL}/app/#/album/${id}/show`;
const artistLink = (id: string) => `${NAVIDROME_SERVER_URL}/app/#/artist/${id}/show`;

interface SongOfTheDay {
  title: string;
  artist: string;
  album: string;
  /** Needed to hand the track to the docked player; absent in caches written
   *  before the play button existed. */
  albumId?: string;
  trackId?: string;
  artistId?: string;
  /** Which build's selection this was. Bump when a change alters what the day's
   *  song should be, so stale picks are replaced rather than held until the
   *  date rolls over. */
  pick?: number;
}

interface GitHubStats {
  totalCommits: number;
  lastCommitAuthor: string;
  lastCommitDate: string;
  lastCommitMessage: string;
}

const GITHUB_CACHE_KEY = "githubStats";
const GITHUB_CACHE_TS_KEY = "githubStatsTimestamp";
const GITHUB_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const LIBRARY_CACHE_KEY = "libraryStats";
const LIBRARY_CACHE_TS_KEY = "libraryStatsTimestamp";
const LIBRARY_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/** Navidrome treats size=0 as "no limit" and caps any explicit size at this,
 *  so a response landing exactly on it is indistinguishable from a truncated
 *  one and has to be re-counted a page at a time. */
const PAGE_SIZE = 500;

interface LibraryStats {
  albumCount: number;
  songCount: number;
}

/** Bumped when the day's song would be chosen differently than by the build
 *  that wrote the cache. */
const PICK_VERSION = 2;

const Stats: React.FC = () => {
  const [totalAlbums, setTotalAlbums] = useState(0);
  const [totalSongs, setTotalSongs] = useState(0);
  const [songOfTheDay, setSongOfTheDay] = useState<SongOfTheDay | null>(null);
  const [commitsOpen, setCommitsOpen] = useState(false);
  const { playAlbum } = usePlayerActions();
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

  /** Returns the counts as well as storing them — song of the day needs the
   *  album total, and reading it back off state would only ever see the value
   *  captured when this effect was created. */
  const fetchLibraryStats = async (): Promise<LibraryStats | null> => {
    const { serverUrl, username, password, appName } = getApiConfig();

    const cached = localStorage.getItem(LIBRARY_CACHE_KEY);
    const cachedTimestamp = localStorage.getItem(LIBRARY_CACHE_TS_KEY);
    if (cached && cachedTimestamp) {
      const age = Date.now() - parseInt(cachedTimestamp, 10);
      if (age < LIBRARY_CACHE_TTL) {
        const stats: LibraryStats = JSON.parse(cached);
        setTotalAlbums(stats.albumCount);
        setTotalSongs(stats.songCount);
        return stats;
      }
    }

    try {
      let stats = await getCountsInOneRequest(serverUrl, username, password, appName);

      // Either the server capped the response or it genuinely holds exactly a
      // page's worth; only walking it settles which.
      if (!stats || stats.albumCount === PAGE_SIZE) {
        stats = await getAlbumCountPaginated(serverUrl, username, password, appName);
      }

      setTotalAlbums(stats.albumCount);
      setTotalSongs(stats.songCount);
      localStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify(stats));
      localStorage.setItem(LIBRARY_CACHE_TS_KEY, Date.now().toString());
      return stats;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An unknown error occurred";
      console.error("Error fetching stats:", errorMessage);
      setError(errorMessage);
      return null;
    }
  };

  /** size=0 is Navidrome's "no limit", and every album in the response already
   *  carries its own songCount — so both totals come out of a single call
   *  rather than a full second walk of the library. */
  const getCountsInOneRequest = async (
    serverUrl: string,
    username: string,
    password: string,
    appName: string
  ): Promise<LibraryStats | null> => {
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
      if (data["subsonic-response"].status !== "ok") return null;

      const albums = data["subsonic-response"].albumList2?.album;
      if (!Array.isArray(albums)) return null;

      return {
        albumCount: albums.length,
        songCount: albums.reduce(
          (sum: number, album: any) => sum + (album.songCount || 0),
          0
        ),
      };
    } catch (error) {
      console.log("Single-request count failed, falling back to paginated approach");
      return null;
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
    const pageSize = PAGE_SIZE;
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

  const formatCommitDate = (isoDate: string): string => {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
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

  /** Takes the library size as an argument rather than reading `totalAlbums`:
   *  this runs from the mount effect, whose closure holds the initial 0, and
   *  `% 0` is NaN — which the range guard below lets through. */
  const getDeterministicSongOfTheDay = async (
    serverUrl: string,
    username: string,
    password: string,
    appName: string,
    albumCount: number
  ): Promise<SongOfTheDay> => {
    if (!albumCount) throw new Error("Library size unknown");

    // Get current date as string (YYYY-MM-DD)
    const today = new Date().toISOString().split("T")[0];

    // Generate deterministic indices from date
    const dateHash = hashString(today);
    const albumIndex = dateHash % albumCount;

    // Fetch the album at the calculated index using pagination
    const pageSize = PAGE_SIZE;
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
      albumId: album.id,
      trackId: selectedSong.id,
      artistId: selectedSong.artistId || album.artistId,
      pick: PICK_VERSION,
    };
  };

  /** Hands the day's track to the docked album player, cued to that track. */
  const playSongOfTheDay = () => {
    if (!songOfTheDay?.albumId) return;
    playAlbum(
      {
        id: songOfTheDay.albumId,
        title: songOfTheDay.album,
        artist: songOfTheDay.artist,
      },
      songOfTheDay.trackId
    );
  };

  const fetchSongOfTheDay = async (albumCount: number) => {
    const { serverUrl, username, password, appName } = getApiConfig();

    const storedSong = localStorage.getItem("songOfTheDay");
    const storedDate = localStorage.getItem("songOfTheDayDate");
    const today = new Date().toISOString().split("T")[0];

    if (storedSong && storedDate === today) {
      const cached: SongOfTheDay = JSON.parse(storedSong);
      // Entries cached before the play button existed carry no ids; refetch
      // rather than serving a day with no way to play it. Entries below the
      // current pick version were chosen at random by a build where the
      // deterministic path could not run, so they are not the day's song
      // everyone else is seeing.
      if (cached.albumId && cached.trackId && cached.pick === PICK_VERSION) {
        setSongOfTheDay(cached);
        return;
      }
    }

    try {
      // Try deterministic selection first
      console.log("Attempting deterministic song selection...");
      const songData = await getDeterministicSongOfTheDay(
        serverUrl,
        username,
        password,
        appName,
        albumCount
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

          const songData: SongOfTheDay = {
            title: song.title,
            artist: song.artist,
            album: song.album,
            albumId,
            trackId: song.id,
            artistId: song.artistId,
            pick: PICK_VERSION,
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
        // The song is picked by indexing into the library, so the count has to
        // land first; GitHub is unrelated and runs alongside both.
        await Promise.all([
          fetchLibraryStats().then((stats) => fetchSongOfTheDay(stats?.albumCount ?? 0)),
          fetchGitHubStats(),
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    return () => {};
  }, []);

  if (error) {
    return (
      <p className="stats-message">
        stats unavailable — {error}{" "}
        <button onClick={() => window.location.reload()}>retry</button>
      </p>
    );
  }

  if (isLoading) {
    return <p className="stats-message">counting…</p>;
  }

  return (
    <dl className="stats-list">
      <div className="stats-row">
        <dt>albums</dt>
        <dd>{totalAlbums.toLocaleString()}</dd>
      </div>
      <div className="stats-row">
        <dt>songs</dt>
        <dd>{totalSongs.toLocaleString()}</dd>
      </div>
      {githubStats && githubStats.totalCommits > 0 && (
        <div className="stats-row">
          <dt>commits</dt>
          <dd>
            <button
              type="button"
              className={`stats-toggle${commitsOpen ? " is-open" : ""}`}
              onClick={() => setCommitsOpen((open) => !open)}
              aria-expanded={commitsOpen}
              aria-controls="stats-last-commit"
              aria-label="Show the latest commit"
            >
              {githubStats.totalCommits.toLocaleString()}
              <span className="stats-caret" aria-hidden="true">›</span>
            </button>
          </dd>
        </div>
      )}

      {githubStats && (
        <div
          id="stats-last-commit"
          className={`stats-commit${commitsOpen ? " is-open" : ""}`}
        >
          <div className="stats-commit-inner">
            <a
              href="https://github.com/tomtomwillis/Yabby/commits/main"
              target="_blank"
              rel="noopener noreferrer"
            >
              {githubStats.lastCommitMessage.split("\n")[0]}
            </a>
            <span className="stats-meta">
              {githubStats.lastCommitAuthor}, {formatCommitDate(githubStats.lastCommitDate)}
            </span>
          </div>
        </div>
      )}

      {songOfTheDay && (
        <div className="stats-row stats-row--stacked">
          <dt>song of the day</dt>
          <dd>
            <span className="stats-song">
              {songOfTheDay.albumId && songOfTheDay.trackId && (
                <button
                  className="stats-play"
                  onClick={playSongOfTheDay}
                  aria-label={`Play ${songOfTheDay.title}`}
                >
                  ▶
                </button>
              )}
              {songOfTheDay.title}
            </span>
            <span className="stats-meta">
              {songOfTheDay.albumId ? (
                <a href={albumLink(songOfTheDay.albumId)} target="_blank" rel="noopener noreferrer">
                  {songOfTheDay.album}
                </a>
              ) : songOfTheDay.album}
              {' — '}
              {songOfTheDay.artistId ? (
                <a href={artistLink(songOfTheDay.artistId)} target="_blank" rel="noopener noreferrer">
                  {songOfTheDay.artist}
                </a>
              ) : songOfTheDay.artist}
            </span>
          </dd>
        </div>
      )}

    </dl>
  );
};

export default Stats;