import React, { useState } from 'react';
import Button from './basic/Button';
import { createStickerPlaylist, createAllSongsPlaylist, createFavoriteTracksPlaylist, type PlaylistProgress, type PlaylistResult } from '../utils/createStickerPlaylist';
import './basic/Button.css';

interface ActivityLog {
  id: number;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

const CreateStickerPlaylistButton: React.FC = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState<PlaylistProgress | null>(null);
  const [result, setResult] = useState<PlaylistResult | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [currentPlaylistType, setCurrentPlaylistType] = useState<'both' | 'all-songs' | 'favorites' | null>(null);

  const addToLog = (type: ActivityLog['type'], message: string) => {
    const logEntry: ActivityLog = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setActivityLog(prev => [logEntry, ...prev]);
  };

  const formatTime = (ms: number | undefined): string => {
    if (!ms) return 'Unknown';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStatusEmoji = (status: PlaylistProgress['status']): string => {
    switch (status) {
      case 'idle': return '⏸️';
      case 'processing': return '🔄';
      case 'creating-playlists': return '🎵';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '❓';
    }
  };

  const handleProgressUpdate = (newProgress: PlaylistProgress) => {
    setProgress(newProgress);

    // Add relevant log entries for current task
    if (newProgress.currentTask && newProgress.currentTask !== progress?.currentTask) {
      addToLog('info', newProgress.currentTask);
    }

    // Add relevant log entries
    if (newProgress.currentAlbum && newProgress.currentAlbumId) {
      addToLog('info', `Processing: ${newProgress.currentAlbum} (${newProgress.currentAlbumId})`);
    }

    if (newProgress.status === 'creating-playlists') {
      addToLog('info', `Creating playlists - All songs: ${newProgress.totalSongs}, Favorites: ${newProgress.favoriteTracks}`);
    }

    // Log any new errors
    if (newProgress.errors.length > (progress?.errors.length || 0)) {
      const newErrors = newProgress.errors.slice(progress?.errors.length || 0);
      newErrors.forEach(error => {
        addToLog('error', `Failed to process album ${error.albumId}: ${error.error}`);
      });
    }
  };

  const handleCreatePlaylist = async (type: 'both' | 'all-songs' | 'favorites') => {
    setIsCreating(true);
    setCurrentPlaylistType(type);
    setProgress(null);
    setResult(null);
    setActivityLog([]);
    
    const typeLabel = type === 'both' ? 'dual playlist' : 
                     type === 'all-songs' ? 'all songs playlist' : 
                     'favorite tracks playlist';
    addToLog('info', `Starting ${typeLabel} creation process...`);

    try {
      let result: PlaylistResult;
      
      switch (type) {
        case 'both':
          result = await createStickerPlaylist(handleProgressUpdate);
          break;
        case 'all-songs':
          result = await createAllSongsPlaylist(handleProgressUpdate);
          break;
        case 'favorites':
          result = await createFavoriteTracksPlaylist(handleProgressUpdate);
          break;
      }
      
      setResult(result);

      if (result.success) {
        addToLog('success', `${typeLabel} created successfully!`);
        if (result.allSongsPlaylist) {
          addToLog('success', `All Songs: ${result.allSongsPlaylist.songCount} songs`);
        }
        if (result.favoriteTracksPlaylist) {
          addToLog('success', `Favorites: ${result.favoriteTracksPlaylist.songCount} tracks`);
        }
        addToLog('info', `Processed ${result.processedAlbums} albums`);
        if (result.errors.length > 0) {
          addToLog('warning', `Completed with ${result.errors.length} errors`);
        }
      } else {
        addToLog('error', `${typeLabel} creation failed`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addToLog('error', `${typeLabel} creation failed: ${errorMessage}`);
      setResult({
        success: false,
        totalSongs: 0,
        favoriteTracks: 0,
        processedAlbums: 0,
        errors: [{ albumId: 'unknown', error: errorMessage }],
        duration: 0,
      });
    } finally {
      setIsCreating(false);
      setCurrentPlaylistType(null);
    }
  };

  return (
    <div style={{ 
      padding: '20px', 
      border: '2px solid var(--colour3)', 
      borderRadius: '8px', 
      backgroundColor: 'var(--colour1)',
      maxWidth: '800px',
      margin: '20px auto'
    }}>
      <h2 style={{ 
        color: 'var(--colour4)', 
        marginBottom: '15px',
        fontFamily: 'var(--font2)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        🎵 Create Sticker Playlist 
        <span style={{ fontSize: '14px', opacity: 0.7 }}>(283 albums)</span>
      </h2>

      <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Button
          type="basic"
          label={isCreating && currentPlaylistType === 'both' ? 'Creating Both Playlists...' : 'Create Both Playlists'}
          onClick={() => handleCreatePlaylist('both')}
          disabled={isCreating}
        />
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button
            type="basic"
            label={isCreating && currentPlaylistType === 'all-songs' ? 'Creating All Songs...' : 'All Songs Only'}
            onClick={() => handleCreatePlaylist('all-songs')}
            disabled={isCreating}
          />
          
          <Button
            type="basic"
            label={isCreating && currentPlaylistType === 'favorites' ? 'Creating Favorites...' : 'Favorites Only'}
            onClick={() => handleCreatePlaylist('favorites')}
            disabled={isCreating}
          />
        </div>
        
        <div style={{ 
          fontSize: '12px', 
          color: 'var(--colour4)', 
          opacity: 0.8,
          fontStyle: 'italic',
          textAlign: 'center'
        }}>
          Both = All songs + Favorites | All Songs = Every song from stickered albums | Favorites = Only user-selected favorite tracks
        </div>
      </div>

      {/* Progress Section */}
      {progress && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '15px', 
          backgroundColor: 'var(--colour2)', 
          borderRadius: '6px'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px', 
            marginBottom: '10px',
            color: 'var(--colour4)',
            fontFamily: 'var(--font2)'
          }}>
            <span style={{ fontSize: '18px' }}>{getStatusEmoji(progress.status)}</span>
            <span style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
              {progress.status.replace('-', ' ')}
            </span>
          </div>

          {/* Overall Progress Bar */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginBottom: '5px',
              fontSize: '14px',
              color: 'var(--colour4)'
            }}>
              <span>Albums: {progress.albumsProcessed}/{progress.totalAlbums}</span>
              <span>{Math.round((progress.albumsProcessed / progress.totalAlbums) * 100)}%</span>
            </div>
            <div style={{ 
              width: '100%', 
              height: '10px', 
              backgroundColor: 'var(--colour1)', 
              borderRadius: '5px',
              overflow: 'hidden'
            }}>
              <div style={{ 
                width: `${(progress.albumsProcessed / progress.totalAlbums) * 100}%`, 
                height: '100%', 
                backgroundColor: 'var(--colour3)',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>

          {/* Current Status */}
          {(progress.currentAlbum || progress.currentTask) && (
            <div style={{ 
              fontSize: '14px', 
              color: 'var(--colour4)', 
              marginBottom: '8px',
              fontFamily: 'var(--font2)'
            }}>
              {progress.currentTask && (
                <div><strong>Task:</strong> {progress.currentTask}</div>
              )}
              {progress.currentAlbum && (
                <div><strong>Current Album:</strong> {progress.currentAlbum}</div>
              )}
            </div>
          )}

          {/* Stats Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
            gap: '10px',
            fontSize: '12px',
            color: 'var(--colour4)'
          }}>
            <div>📀 Songs: <strong>{progress.totalSongs}</strong></div>
            <div>⭐ Favorites: <strong>{progress.favoriteTracks}</strong></div>
            <div>📦 Batch: <strong>{progress.batchNumber}</strong></div>
            <div>❌ Errors: <strong>{progress.errors.length}</strong></div>
            {progress.estimatedTimeRemaining && (
              <div>⏱️ ETA: <strong>{formatTime(progress.estimatedTimeRemaining)}</strong></div>
            )}
          </div>
        </div>
      )}

      {/* Results Section */}
      {result && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '15px', 
          backgroundColor: result.success ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)', 
          borderRadius: '6px',
          border: `1px solid ${result.success ? 'green' : 'red'}`
        }}>
          <h3 style={{ 
            color: 'var(--colour4)', 
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {result.success ? '✅' : '❌'} 
            {result.success ? 'Success!' : 'Failed'}
          </h3>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
            gap: '10px',
            fontSize: '14px',
            color: 'var(--colour4)'
          }}>
            <div>🎵 Total Songs: <strong>{result.totalSongs}</strong></div>
            <div>⭐ Favorites: <strong>{result.favoriteTracks}</strong></div>
            <div>📀 Albums: <strong>{result.processedAlbums}</strong></div>
            <div>❌ Errors: <strong>{result.errors.length}</strong></div>
            <div>⏱️ Duration: <strong>{formatTime(result.duration)}</strong></div>
          </div>

          {result.success && (result.allSongsPlaylist || result.favoriteTracksPlaylist) && (
            <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {result.allSongsPlaylist && (
                <div>
                  <h4 style={{ color: 'var(--colour4)', margin: '0 0 8px 0', fontSize: '16px' }}>
                    🎵 All Songs Playlist
                  </h4>
                  <div style={{ fontSize: '14px', color: 'var(--colour4)', marginBottom: '8px' }}>
                    <strong>{result.allSongsPlaylist.name}</strong> - {result.allSongsPlaylist.songCount} songs
                  </div>
                  <Button
                    type="basic"
                    label="Open All Songs Playlist"
                    onClick={() => window.open(
                      `${import.meta.env.VITE_NAVIDROME_SERVER_URL}/app/#/playlist/${result.allSongsPlaylist!.id}/show`, 
                      '_blank'
                    )}
                  />
                </div>
              )}
              
              {result.favoriteTracksPlaylist && (
                <div>
                  <h4 style={{ color: 'var(--colour4)', margin: '0 0 8px 0', fontSize: '16px' }}>
                    ⭐ Favorite Tracks Playlist
                  </h4>
                  <div style={{ fontSize: '14px', color: 'var(--colour4)', marginBottom: '8px' }}>
                    <strong>{result.favoriteTracksPlaylist.name}</strong> - {result.favoriteTracksPlaylist.songCount} tracks
                  </div>
                  <Button
                    type="basic"
                    label="Open Favorites Playlist"
                    onClick={() => window.open(
                      `${import.meta.env.VITE_NAVIDROME_SERVER_URL}/app/#/playlist/${result.favoriteTracksPlaylist!.id}/show`, 
                      '_blank'
                    )}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Activity Log */}
      {activityLog.length > 0 && (
        <div style={{ 
          border: '1px solid var(--colour3)', 
          borderRadius: '6px',
          backgroundColor: 'var(--colour2)'
        }}>
          <div 
            onClick={() => setIsLogExpanded(!isLogExpanded)}
            style={{ 
              padding: '10px 15px', 
              cursor: 'pointer', 
              borderBottom: isLogExpanded ? '1px solid var(--colour3)' : 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: 'var(--colour4)',
              fontFamily: 'var(--font2)'
            }}
          >
            <span>📝 Activity Log ({activityLog.length} entries)</span>
            <span>{isLogExpanded ? '▼' : '▶'}</span>
          </div>
          
          {isLogExpanded && (
            <div style={{ 
              maxHeight: '300px', 
              overflowY: 'auto', 
              padding: '10px 15px'
            }}>
              {activityLog.map(entry => (
                <div 
                  key={entry.id}
                  style={{ 
                    marginBottom: '8px', 
                    fontSize: '12px',
                    display: 'flex',
                    gap: '8px',
                    color: 'var(--colour4)'
                  }}
                >
                  <span style={{ opacity: 0.7, minWidth: '60px' }}>
                    {entry.timestamp}
                  </span>
                  <span style={{ 
                    minWidth: '20px',
                    color: entry.type === 'error' ? 'red' : 
                           entry.type === 'success' ? 'green' :
                           entry.type === 'warning' ? 'orange' : 'inherit'
                  }}>
                    {entry.type === 'error' ? '❌' :
                     entry.type === 'success' ? '✅' :
                     entry.type === 'warning' ? '⚠️' : 'ℹ️'}
                  </span>
                  <span style={{ flex: 1 }}>{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CreateStickerPlaylistButton;