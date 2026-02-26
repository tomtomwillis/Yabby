// Utility for creating Navidrome playlist from albums with stickers
import albumIds from '../../albumIds.json';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export interface PlaylistProgress {
  albumsProcessed: number;
  totalAlbums: number;
  currentAlbum?: string;
  currentAlbumId?: string;
  totalSongs: number;
  favoriteTracks: number;
  errors: Array<{ albumId: string; error: string; albumName?: string }>;
  batchNumber: number;
  estimatedTimeRemaining?: number;
  status: 'idle' | 'processing' | 'creating-playlists' | 'completed' | 'error';
  currentTask?: string;
}

export interface PlaylistResult {
  success: boolean;
  allSongsPlaylist?: { id: string; name: string; songCount: number };
  favoriteTracksPlaylist?: { id: string; name: string; songCount: number };
  totalSongs: number;
  favoriteTracks: number;
  processedAlbums: number;
  errors: Array<{ albumId: string; error: string; albumName?: string }>;
  duration: number; // in milliseconds
}

interface StickerData {
  albumId: string;
  favoriteTrackId?: string;
  favoriteTrackTitle?: string;
}

type ProgressCallback = (progress: PlaylistProgress) => void;

const API_CONFIG = {
  serverUrl: import.meta.env.VITE_NAVIDROME_SERVER_URL,
  username: import.meta.env.VITE_NAVIDROME_API_USERNAME,
  password: import.meta.env.VITE_NAVIDROME_API_PASSWORD,
  clientId: import.meta.env.VITE_NAVIDROME_CLIENT_ID,
};

// Batch processing configuration
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 10000;

export async function createStickerPlaylist(
  onProgress?: ProgressCallback
): Promise<PlaylistResult> {
  return createPlaylists('both', onProgress);
}

export async function createAllSongsPlaylist(
  onProgress?: ProgressCallback
): Promise<PlaylistResult> {
  return createPlaylists('all-songs', onProgress);
}

export async function createFavoriteTracksPlaylist(
  onProgress?: ProgressCallback
): Promise<PlaylistResult> {
  return createPlaylists('favorites', onProgress);
}

async function createPlaylists(
  mode: 'both' | 'all-songs' | 'favorites',
  onProgress?: ProgressCallback
): Promise<PlaylistResult> {
  const startTime = Date.now();
  console.log(`🎵 Starting ${mode === 'both' ? 'dual' : mode === 'all-songs' ? 'all songs' : 'favorite tracks'} playlist creation process...`);
  console.log(`📊 Processing ${albumIds.length} albums in batches of ${BATCH_SIZE}`);
  
  let progress: PlaylistProgress = {
    albumsProcessed: 0,
    totalAlbums: albumIds.length,
    totalSongs: 0,
    favoriteTracks: 0,
    errors: [],
    batchNumber: 0,
    status: 'processing',
    currentTask: 'Fetching sticker data...',
  };

  const allSongIds: string[] = [];
  const favoriteSongIds: string[] = [];
  const processedAlbums: Array<{ id: string; name: string; songCount: number }> = [];

  try {
    // First, fetch sticker data to get favorite track information
    onProgress?.(progress);
    console.log('🔍 Fetching sticker data from Firestore...');
    
    const stickerData = await fetchStickerData(albumIds);
    console.log(`📋 Found ${stickerData.length} stickers with favorite tracks`);
    
    // Create a map of all favorite tracks (deduplicated by track ID)
    const favoriteTrackMap = new Map<string, { trackId: string; trackTitle: string; albumId: string }>();
    stickerData.forEach(sticker => {
      if (sticker.favoriteTrackId && sticker.favoriteTrackTitle) {
        // Use track ID as key to deduplicate identical tracks
        if (!favoriteTrackMap.has(sticker.favoriteTrackId)) {
          favoriteTrackMap.set(sticker.favoriteTrackId, {
            trackId: sticker.favoriteTrackId,
            trackTitle: sticker.favoriteTrackTitle,
            albumId: sticker.albumId
          });
        }
      }
    });
    
    // Also create a lookup by album for processing
    const favoriteTracksByAlbum = new Map<string, Array<{ trackId: string; trackTitle: string }>>();
    stickerData.forEach(sticker => {
      if (sticker.favoriteTrackId && sticker.favoriteTrackTitle) {
        if (!favoriteTracksByAlbum.has(sticker.albumId)) {
          favoriteTracksByAlbum.set(sticker.albumId, []);
        }
        // Check if this track is already in the album's list
        const albumTracks = favoriteTracksByAlbum.get(sticker.albumId)!;
        if (!albumTracks.find(track => track.trackId === sticker.favoriteTrackId)) {
          albumTracks.push({
            trackId: sticker.favoriteTrackId,
            trackTitle: sticker.favoriteTrackTitle
          });
        }
      }
    });
    
    progress.currentTask = 'Processing albums...';
    onProgress?.(progress);
    // Process albums in batches
    for (let i = 0; i < albumIds.length; i += BATCH_SIZE) {
      const batch = albumIds.slice(i, i + BATCH_SIZE);
      progress.batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(albumIds.length / BATCH_SIZE);
      
      console.log(`\n📦 Processing batch ${progress.batchNumber}/${totalBatches} (${batch.length} albums)`);
      
      // Process each album in the current batch
      for (const albumId of batch) {
        progress.currentAlbumId = albumId;
        progress.estimatedTimeRemaining = calculateEstimatedTime(
          startTime,
          progress.albumsProcessed,
          progress.totalAlbums
        );
        
        onProgress?.(progress);
        
        try {
          console.log(`🎧 Fetching album: ${albumId}`);
          const albumData = await fetchAlbumWithRetry(albumId);
          
          if (albumData && albumData.songs.length > 0) {
            progress.currentAlbum = albumData.name;
            
            // Add all songs if processing all-songs or both modes
            if (mode === 'all-songs' || mode === 'both') {
              allSongIds.push(...albumData.songs);
            }
            
            // Check for favorite tracks if processing favorites or both modes
            if (mode === 'favorites' || mode === 'both') {
              const favoriteTracks = favoriteTracksByAlbum.get(albumId) || [];
              for (const favoriteTrack of favoriteTracks) {
                if (albumData.songs.includes(favoriteTrack.trackId)) {
                  favoriteSongIds.push(favoriteTrack.trackId);
                  progress.favoriteTracks++;
                  console.log(`⭐ Added favorite track: "${favoriteTrack.trackTitle}" from "${albumData.name}"`);
                }
              }
            }
            
            processedAlbums.push({
              id: albumId,
              name: albumData.name,
              songCount: albumData.songs.length
            });
            
            if (mode === 'all-songs' || mode === 'both') {
              progress.totalSongs += albumData.songs.length;
            }
            
            console.log(`✅ Processed "${albumData.name}" - ${albumData.songs.length} songs`);
          } else {
            console.warn(`⚠️ No songs found for album: ${albumId}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ Failed to process album ${albumId}:`, errorMessage);
          progress.errors.push({ albumId, error: errorMessage });
        }
        
        progress.albumsProcessed++;
        onProgress?.(progress);
      }
      
      // Delay between batches (except for the last batch)
      if (i + BATCH_SIZE < albumIds.length) {
        console.log(`⏳ Waiting ${BATCH_DELAY_MS}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    // Create the playlists based on mode
    progress.status = 'creating-playlists';
    progress.currentTask = 'Creating playlists...';
    progress.currentAlbum = undefined;
    onProgress?.(progress);

    const dateStamp = new Date().toLocaleDateString();
    
    console.log(`\n🎼 Creating playlists (mode: ${mode})...`);
    if (mode === 'all-songs' || mode === 'both') {
      console.log(`   - All Songs: ${allSongIds.length} songs from ${processedAlbums.length} albums`);
    }
    if (mode === 'favorites' || mode === 'both') {
      console.log(`   - Favorites: ${favoriteSongIds.length} unique favorite tracks`);
    }
    
    const results: any = {};
    
    // Create all songs playlist
    if ((mode === 'all-songs' || mode === 'both') && allSongIds.length > 0) {
      progress.currentTask = 'Creating all songs playlist...';
      onProgress?.(progress);
      
      const allSongsName = `Albums with Stickers - All Songs - ${dateStamp}`;
      const allSongsResult = await createNavidromePlaylist(allSongsName, allSongIds);
      results.allSongsPlaylist = {
        id: allSongsResult.playlistId,
        name: allSongsName,
        songCount: allSongIds.length
      };
    }
    
    // Create favorite tracks playlist
    if ((mode === 'favorites' || mode === 'both') && favoriteSongIds.length > 0) {
      progress.currentTask = 'Creating favorite tracks playlist...';
      onProgress?.(progress);
      
      const favoritesName = `Albums with Stickers - Favorite Tracks - ${dateStamp}`;
      const favoritesResult = await createNavidromePlaylist(favoritesName, favoriteSongIds);
      results.favoriteTracksPlaylist = {
        id: favoritesResult.playlistId,
        name: favoritesName,
        songCount: favoriteSongIds.length
      };
    }
    
    progress.status = 'completed';
    progress.currentTask = 'Completed!';
    onProgress?.(progress);

    const duration = Date.now() - startTime;
    console.log(`\n🎉 Playlist creation completed!`);
    console.log(`📈 Stats:`);
    console.log(`   - Duration: ${Math.round(duration / 1000)}s`);
    console.log(`   - Albums processed: ${processedAlbums.length}/${albumIds.length}`);
    console.log(`   - Total songs: ${allSongIds.length}`);
    console.log(`   - Favorite tracks: ${favoriteSongIds.length}`);
    console.log(`   - Errors: ${progress.errors.length}`);
    if (results.allSongsPlaylist) {
      console.log(`   - All Songs Playlist ID: ${results.allSongsPlaylist.id}`);
    }
    if (results.favoriteTracksPlaylist) {
      console.log(`   - Favorites Playlist ID: ${results.favoriteTracksPlaylist.id}`);
    }

    return {
      success: true,
      allSongsPlaylist: results.allSongsPlaylist,
      favoriteTracksPlaylist: results.favoriteTracksPlaylist,
      totalSongs: allSongIds.length,
      favoriteTracks: favoriteSongIds.length,
      processedAlbums: processedAlbums.length,
      errors: progress.errors,
      duration,
    };
  } catch (error) {
    progress.status = 'error';
    onProgress?.(progress);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('💥 Playlist creation failed:', errorMessage);
    
    return {
      success: false,
      totalSongs: allSongIds.length,
      favoriteTracks: favoriteSongIds.length,
      processedAlbums: processedAlbums.length,
      errors: [...progress.errors, { albumId: 'playlist-creation', error: errorMessage }],
      duration: Date.now() - startTime,
    };
  }
}

async function fetchAlbumWithRetry(
  albumId: string,
  maxRetries: number = 2
): Promise<{ name: string; songs: string[] } | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await Promise.race([
        fetch(
          `${API_CONFIG.serverUrl}/rest/getAlbum?id=${albumId}&u=${API_CONFIG.username}&p=${API_CONFIG.password}&v=1.16.1&c=${API_CONFIG.clientId}&f=json`,
          {
            headers: {
              Authorization: 'Basic ' + btoa(`${API_CONFIG.username}:${API_CONFIG.password}`),
            },
          }
        ),
        new Promise<Response>((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), REQUEST_TIMEOUT_MS)
        )
      ]);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data['subsonic-response']?.status !== 'ok') {
        throw new Error(data['subsonic-response']?.error?.message || 'API error');
      }

      const album = data['subsonic-response']?.album;
      if (!album) {
        throw new Error('Album not found');
      }

      const songs = album.song?.map((song: any) => song.id) || [];
      
      console.log(`📀 "${album.name}" by ${album.artist} - ${songs.length} songs`);
      
      return {
        name: `${album.artist} - ${album.name}`,
        songs,
      };
    } catch (error) {
      console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed for ${albumId}:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return null;
}

async function createNavidromePlaylist(
  name: string,
  songIds: string[]
): Promise<{ playlistId: string }> {
  console.log(`🎵 Creating playlist "${name}" with ${songIds.length} songs...`);
  
  const url = new URL(`${API_CONFIG.serverUrl}/rest/createPlaylist`);
  url.searchParams.append('u', API_CONFIG.username);
  url.searchParams.append('p', API_CONFIG.password);
  url.searchParams.append('v', '1.16.1');
  url.searchParams.append('c', API_CONFIG.clientId);
  url.searchParams.append('name', name);
  
  // Add all song IDs
  songIds.forEach(songId => {
    url.searchParams.append('songId', songId);
  });

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: 'Basic ' + btoa(`${API_CONFIG.username}:${API_CONFIG.password}`),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to create playlist: HTTP ${response.status}`);
  }

  const data = await response.json();
  
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error(
      data['subsonic-response']?.error?.message || 'Failed to create playlist'
    );
  }

  // The playlist ID might be in the response or we might need to fetch playlists
  // to get the ID of the newly created one
  const playlistId = data['subsonic-response']?.playlist?.id || 'unknown';
  
  console.log(`✅ Playlist created successfully! ID: ${playlistId}`);
  
  return { playlistId };
}

function calculateEstimatedTime(
  startTime: number,
  processed: number,
  total: number
): number | undefined {
  if (processed === 0) return undefined;
  
  const elapsed = Date.now() - startTime;
  const avgTimePerItem = elapsed / processed;
  const remaining = total - processed;
  
  return Math.round(avgTimePerItem * remaining);
}

async function fetchStickerData(albumIds: string[]): Promise<StickerData[]> {
  console.log('📋 Fetching sticker data for favorite tracks...');
  
  try {
    // Fetch all stickers for the albums we're processing
    const stickerPromises = albumIds.map(async (albumId) => {
      const stickersQuery = query(
        collection(db, 'stickers'),
        where('albumId', '==', albumId)
      );
      
      const snapshot = await getDocs(stickersQuery);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          albumId: data.albumId,
          favoriteTrackId: data.favoriteTrackId,
          favoriteTrackTitle: data.favoriteTrackTitle,
        } as StickerData;
      });
    });
    
    const allStickerArrays = await Promise.all(stickerPromises);
    const allStickers = allStickerArrays.flat();
    
    // Filter to only stickers with favorite tracks (keep all, don't deduplicate by album)
    const stickersWithFavorites = allStickers.filter(sticker => 
      sticker.favoriteTrackId && sticker.favoriteTrackTitle
    );
    
    console.log(`🎵 Found ${stickersWithFavorites.length} stickers with favorite tracks across ${new Set(stickersWithFavorites.map(s => s.albumId)).size} albums`);
    
    return stickersWithFavorites;
  } catch (error) {
    console.error('Error fetching sticker data:', error);
    return [];
  }
}