/**
 * usePlayer.ts — React hook bridging the Zustand store to Electron IPC
 *
 * Uses mpv IPC by default, with automatic Chromium HTML5 <audio> fallback
 * when mpv is not installed (e.g., standalone Windows portable runs).
 */

import { useCallback, useEffect } from 'react';
import { usePlayerStore, Track } from '../store';

declare global {
  interface Window {
    electronAPI: {
      player: {
        play: (url: string, meta: object) => Promise<{ ok: boolean; fallback?: boolean; mode?: string }>;
        pause: () => Promise<void>;
        resume: () => Promise<void>;
        stop: () => Promise<void>;
        seek: (seconds: number) => Promise<void>;
        setVolume: (vol: number) => Promise<void>;
        setSpeed: (speed: number) => Promise<{ ok: boolean }>;
        setNormalization: (enabled: boolean) => Promise<{ ok: boolean }>;
        downloadTrack: (track: object) => Promise<{ ok: boolean; path?: string; error?: string }>;
        getStatus: () => Promise<{ isPlaying: boolean; position: number; duration: number }>;
        onProgress: (cb: (info: { position: number; duration: number; isPlaying: boolean }) => void) => () => void;
        onEnded: (cb: () => void) => () => void;
      };
      ytmusic: {
        search: (query: string) => Promise<Track[]>;
        getStreamUrl: (videoId: string) => Promise<{ url: string; ok: boolean; error?: string }>;
        getHome: () => Promise<{ trending: Track[] }>;
        getCategory: (category: string, forceRefresh?: boolean) => Promise<Track[]>;
        getSuggested: (videoId: string) => Promise<Track[]>;
        getAlbum: (albumId: string) => Promise<Track[]>;
        getPlaylist: (playlistId: string) => Promise<Track[]>;
      };
      spotify: {
        getStatus: () => Promise<{ connected: boolean; user?: any }>;
        login: () => Promise<{ ok: boolean; user?: any; error?: string }>;
        connectManual: (spDc: string) => Promise<{ ok: boolean; user?: any; error?: string }>;
        disconnect: () => Promise<{ ok: boolean }>;
        getLikedSongs: (limit?: number, offset?: number) => Promise<Track[]>;
        getPlaylists: (limit?: number) => Promise<Array<{ id: string; name: string; description?: string; trackCount: number; thumbnail?: string }>>;
        getPlaylistTracks: (playlistId: string) => Promise<Track[]>;
        resolveTrack: (track: { title: string; artist: string }) => Promise<{ url: string | null; id: string | null }>;
      };
      library: {
        scan: (dir: string) => Promise<Track[]>;
        addDirectory: () => Promise<string | null>;
        addFiles: () => Promise<string[]>;
        getMetadata: (path: string) => Promise<Track>;
      };
      lyrics: {
        get: (title: string, artist: string, duration: number) => Promise<{
          synced: Array<{ time: number; text: string }>;
          plain: string;
          source: string;
        }>;
      };
      scrobble: {
        configure: (apiKey: string, apiSecret: string, sessionKey: string) => Promise<{ ok: boolean }>;
        updateNowPlaying: (track: object) => Promise<{ ok: boolean }>;
        scrobble: (track: object) => Promise<{ ok: boolean }>;
      };
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      openExternal: (url: string) => void;
    };
  }
}

let fallbackAudio: HTMLAudioElement | null = null;
let usingHtml5Fallback = false;
let playbackStartTimestamp = 0;
let fallbackEndedHandler: (() => void) | null = null;

function getFallbackAudio(): HTMLAudioElement {
  if (!fallbackAudio) {
    fallbackAudio = new Audio();
    fallbackAudio.preload = 'auto';

    fallbackAudio.addEventListener('timeupdate', () => {
      if (!usingHtml5Fallback || !fallbackAudio) return;
      const store = usePlayerStore.getState();
      store.setPosition(fallbackAudio.currentTime || 0);
      if (Number.isFinite(fallbackAudio.duration) && fallbackAudio.duration > 0) {
        store.setDuration(fallbackAudio.duration);
      }
    });

    fallbackAudio.addEventListener('loadedmetadata', () => {
      if (!usingHtml5Fallback || !fallbackAudio) return;
      if (Number.isFinite(fallbackAudio.duration) && fallbackAudio.duration > 0) {
        usePlayerStore.getState().setDuration(fallbackAudio.duration);
      }
    });

    fallbackAudio.addEventListener('ended', () => {
      if (!usingHtml5Fallback) return;
      fallbackEndedHandler?.();
    });
  }
  return fallbackAudio;
}

function stopFallbackAudio() {
  if (fallbackAudio) {
    fallbackAudio.pause();
    fallbackAudio.removeAttribute('src');
    fallbackAudio.load();
  }
  usingHtml5Fallback = false;
}

export function usePlayer() {
  const {
    currentTrack, queue, queueIndex, isPlaying, volume,
    setCurrentTrack, setIsPlaying, setPosition, setLoading,
    nextTrack, prevTrack,
  } = usePlayerStore();

  const playTrack = useCallback(async (track: Track) => {
    const api = window.electronAPI;
    if (!api) return;

    setLoading(true);
    setCurrentTrack(track);
    setIsPlaying(false);
    setPosition(0);

    try {
      let url: string;
      if (track.source === 'local' && track.path) {
        url = `file://${track.path.replace(/\\/g, '/')}`;
      } else if (track.source === 'spotify') {
        const resolved = await api.spotify.resolveTrack({ title: track.title, artist: track.artist });
        if (!resolved.url) throw new Error('Could not resolve Spotify audio stream');
        url = resolved.url;
      } else {
        const res = await api.ytmusic.getStreamUrl(track.id);
        if (!res.ok || !res.url) throw new Error(res.error ?? 'No stream URL');
        url = res.url;
      }

      const playRes = await api.player.play(url, {
        title: track.title,
        artist: track.artist,
        album: track.album ?? '',
      });

      if (playRes?.ok) {
        stopFallbackAudio();
        await api.player.setVolume(volume);
      } else {
        // Fallback to Chromium HTML5 Audio when mpv isn't available on host
        usingHtml5Fallback = true;
        const audio = getFallbackAudio();
        audio.src = url;
        audio.volume = Math.max(0, Math.min(1, volume));
        audio.playbackRate = usePlayerStore.getState().speed || 1;
        await audio.play();
      }

      setIsPlaying(true);
      setLoading(false);
      playbackStartTimestamp = Math.floor(Date.now() / 1000);

      api.scrobble.updateNowPlaying({
        artist: track.artist,
        track: track.title,
        album: track.album,
        duration: track.duration,
      }).catch(() => {/* ignore if not configured */});

    } catch (err) {
      console.error('playTrack error', err);
      setLoading(false);
    }
  }, [volume, setCurrentTrack, setIsPlaying, setPosition, setLoading]);

  const pause = useCallback(async () => {
    if (usingHtml5Fallback && fallbackAudio) {
      fallbackAudio.pause();
    } else {
      await window.electronAPI?.player.pause();
    }
    setIsPlaying(false);
  }, [setIsPlaying]);

  const resume = useCallback(async () => {
    if (usingHtml5Fallback && fallbackAudio) {
      await fallbackAudio.play();
    } else {
      await window.electronAPI?.player.resume();
    }
    setIsPlaying(true);
  }, [setIsPlaying]);

  const seek = useCallback(async (seconds: number) => {
    if (usingHtml5Fallback && fallbackAudio) {
      fallbackAudio.currentTime = seconds;
    } else {
      await window.electronAPI?.player.seek(seconds);
    }
    setPosition(seconds);
  }, [setPosition]);

  const skipNext = useCallback(async () => {
    const next = nextTrack();
    if (next) await playTrack(next);
  }, [nextTrack, playTrack]);

  const skipPrev = useCallback(async () => {
    const prev = prevTrack();
    if (prev) await playTrack(prev);
  }, [prevTrack, playTrack]);

  const changeSpeed = useCallback(async (speed: number) => {
    usePlayerStore.getState().setSpeed(speed);
    if (usingHtml5Fallback && fallbackAudio) {
      fallbackAudio.playbackRate = speed;
    } else {
      await window.electronAPI?.player.setSpeed(speed);
    }
  }, []);

  const toggleNormalization = useCallback(async () => {
    const next = !usePlayerStore.getState().normalization;
    usePlayerStore.getState().setNormalization(next);
    if (!usingHtml5Fallback) {
      await window.electronAPI?.player.setNormalization(next);
    }
  }, []);

  const downloadCurrentTrack = useCallback(async (track?: Track) => {
    const target = track || currentTrack;
    if (!target) return { ok: false, error: 'No track selected' };
    return await window.electronAPI?.player.downloadTrack({
      id: target.id,
      title: target.title,
      artist: target.artist,
    });
  }, [currentTrack]);

  // Keep HTML5 fallback volume synchronized with store volume
  useEffect(() => {
    if (usingHtml5Fallback && fallbackAudio) {
      fallbackAudio.volume = Math.max(0, Math.min(1, volume));
    }
  }, [volume]);

  // Sleep timer interval (countdown every 60s)
  useEffect(() => {
    const timer = setInterval(() => {
      const { sleepTimer, setSleepTimer } = usePlayerStore.getState();
      if (typeof sleepTimer !== 'number' || sleepTimer <= 0) return;
      if (sleepTimer <= 1) {
        setSleepTimer(null);
        pause();
      } else {
        setSleepTimer(sleepTimer - 1);
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [pause]);

  return {
    currentTrack,
    queue,
    queueIndex,
    isPlaying,
    playTrack,
    pause,
    resume,
    seek,
    skipNext,
    skipPrev,
    changeSpeed,
    toggleNormalization,
    downloadCurrentTrack,
  };
}

let globalEventsRegistered = false;

export function usePlayerEvents() {
  const { setPosition, setDuration } = usePlayerStore();
  const { skipNext, pause } = usePlayer();

  useEffect(() => {
    const handleTrackEnded = () => {
      const { sleepTimer, setSleepTimer } = usePlayerStore.getState();
      if (sleepTimer === 'track') {
        setSleepTimer(null);
        pause();
        return;
      }

      const { currentTrack: ct } = usePlayerStore.getState();
      if (ct && ct.duration > 30) {
        window.electronAPI?.scrobble.scrobble({
          artist: ct.artist,
          track: ct.title,
          album: ct.album,
          timestamp: playbackStartTimestamp || Math.floor(Date.now() / 1000),
          duration: ct.duration,
        }).catch(() => {});
      }
      skipNext();
    };

    fallbackEndedHandler = handleTrackEnded;

    const api = window.electronAPI;
    if (!api || globalEventsRegistered) return;
    globalEventsRegistered = true;

    const unsubProgress = api.player.onProgress((info: any) => {
      if (usingHtml5Fallback) return;
      setPosition(info.position);
      setDuration(info.duration);
    });

    const unsubEnded = api.player.onEnded(handleTrackEnded);

    return () => {
      fallbackEndedHandler = null;
      unsubProgress();
      unsubEnded();
      globalEventsRegistered = false;
    };
  }, [setPosition, setDuration, skipNext, pause]);
}
