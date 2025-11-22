import React, { useState, useRef, useEffect } from 'react';
import { IcecastMetadataReader } from 'icecast-metadata-js';
import './RadioPlayer.css';

const IcecastPlayer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [metadata, setMetadata] = useState({ artist: 'YabbyVille Radio', track: '' });
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const abortControllerRef = useRef(null);

  const STREAM_URL = 'https://radio.yabbyville.xyz/radio.opus';

  useEffect(() => {
    if (audioRef.current) {
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = isMuted ? 0 : volume;
      }
    }
  }, [volume, isMuted]);

  const stopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const startStream = async () => {
    try {
      setIsLoading(true);

      // Create audio context
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext();
      
      // Create gain node for volume control
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = isMuted ? 0 : volume;
      gainNodeRef.current.connect(audioContextRef.current.destination);

      // Fetch the stream
      abortControllerRef.current = new AbortController();
      const response = await fetch(STREAM_URL, {
        headers: {
          'Icy-MetaData': '1'
        },
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error('Failed to connect to stream');
      }

      // Set up metadata reader
      const metadataReader = new IcecastMetadataReader({
        metadataTypes: ['ogg'],
        onMetadata: (value) => {
          const { metadata } = value;
          if (metadata && metadata.TITLE) {
            // Parse "Artist - Track" format
            const parts = metadata.TITLE.split(' - ');
            if (parts.length >= 2) {
              setMetadata({
                artist: parts[0].trim(),
                track: parts.slice(1).join(' - ').trim()
              });
            } else {
              setMetadata({
                artist: metadata.TITLE,
                track: ''
              });
            }
          }
        },
        onStream: async (value) => {
          // Decode and play audio
          try {
            const audioBuffer = await audioContextRef.current.decodeAudioData(
              value.stream.buffer.slice(value.stream.byteOffset, value.stream.byteOffset + value.stream.byteLength)
            );
            
            if (sourceNodeRef.current) {
              sourceNodeRef.current.disconnect();
            }
            
            sourceNodeRef.current = audioContextRef.current.createBufferSource();
            sourceNodeRef.current.buffer = audioBuffer;
            sourceNodeRef.current.connect(gainNodeRef.current);
            sourceNodeRef.current.start();
          } catch (error) {
            // Ignore decode errors for now, they're common with streaming
          }
        }
      });

      // Read the stream
      const reader = response.body.getReader();
      setIsPlaying(true);
      setIsLoading(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        await metadataReader.asyncReadAll(value);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Stream error:', error);
        setIsLoading(false);
        setIsPlaying(false);
      }
    }
  };

  const togglePlay = async () => {
    if (isPlaying) {
      stopStream();
      setIsPlaying(false);
      setIsLoading(false);
    } else {
      await startStream();
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  return (
    <div className="icecast-player-container">
      <div className="icecast-player-card">
        <div className="player-header">
          <div className="live-indicator">
            <span className={`live-dot ${isPlaying ? 'pulsing' : ''}`}></span>
            <span className="live-text">{isPlaying ? 'LIVE' : 'OFFLINE'}</span>
          </div>
        </div>

        <div className="now-playing">
          <div className="now-playing-label">Now Playing</div>
          <div className="track-info">
            <div className="artist-name">{metadata.artist}</div>
            {metadata.track && <div className="track-name">{metadata.track}</div>}
          </div>
        </div>

        <div className="player-controls">
          <button
            onClick={togglePlay}
            className="play-button"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="spinner"></div>
            ) : isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>

          <div className="volume-control">
            <button
              onClick={toggleMute}
              className="volume-button"
            >
              {isMuted || volume === 0 ? (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="volume-slider"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default IcecastPlayer;