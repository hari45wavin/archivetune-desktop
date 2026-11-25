/**
 * usePlayer.ts — React hook bridging the Zustand store to Electron IPC
 *
 * Uses mpv IPC by default, with automatic Chromium HTML5 <audio> fallback
 * when mpv is not installed (e.g., standalone Windows portable runs).
 */

import { useCallback, useEffect } from 'react';
import {
  usePlayerStore,
  useLibraryStore,
  useTogetherStore,
  Track,
  CustomPlaylist,
  TrackPlayStat,
} from '../store';

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
        setEqualizer: (gains: number[]) => Promise<{ ok: boolean }>;
        downloadTrack: (track: object) => Promise<{ ok: boolean; path?: string; error?: string }>;
        getStatus: () => Promise<{ isPlaying: boolean; position: number; duration: number }>;
        onProgress: (cb: (info: { position: number; duration: number; isPlaying: boolean }) => void) => () => void;
        onEnded: (cb: () => void) => () => void;
      };
      ytmusic: {
        search: (query: string) => Promise<Track[]>;
        searchCollections: (
          query: string,
          kind: 'album' | 'artist' | 'playlist'
        ) => Promise<Array<{ id: string; title: string; subtitle: string; thumbnail: string; kind: 'album' | 'artist' | 'playlist' }>>;
        getStreamUrl: (videoId: string) => Promise<{ url: string; ok: boolean; error?: string }>;
        getHome: () => Promise<{ trending: Track[] }>;
        getCategory: (category: string, forceRefresh?: boolean) => Promise<Track[]>;
        getSuggested: (videoId: string) => Promise<Track[]>;
        getArtist: (artistId: string) => Promise<Track[]>;
        getAlbum: (albumId: string) => Promise<Track[]>;
        getPlaylist: (playlistId: string) => Promise<Track[]>;
        getAccountStatus: () => Promise<{ connected: boolean }>;
        login: () => Promise<{ ok: boolean; error?: string }>;
        logout: () => Promise<{ ok: boolean }>;
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
        get: (title: string, artist: string, duration: number, videoId?: string) => Promise<{
          synced: Array<{ time: number; text: string }>;
          plain: string;
          source: string;
        }>;
      };
      scrobble: {
        configure: (apiKey: string, apiSecret: string, sessionKey: string) => Promise<{ ok: boolean }>;
        configureListenBrainz: (token: string) => Promise<{ ok: boolean }>;
        updateNowPlaying: (track: object) => Promise<{ ok: boolean }>;
        scrobble: (track: object) => Promise<{ ok: boolean }>;
      };
      sponsorblock: {
        getSegments: (videoId: string) => Promise<Array<{ start: number; end: number; category: string }>>;
      };
      discord: {
        setActivity: (track: {
          title: string;
          artist: string;
          album?: string;
          thumbnail?: string;
          duration?: number;
          position?: number;
        } | null) => Promise<{ ok: boolean }>;
      };
      storage: {
        getState: () => Promise<{
          favorites: Track[];
          playlists: CustomPlaylist[];
          playStats: Record<string, TrackPlayStat>;
          totalListeningSeconds: number;
        }>;
        toggleFavorite: (track: Track) => Promise<Track[]>;
        createPlaylist: (name: string) => Promise<CustomPlaylist[]>;
        deletePlaylist: (playlistId: string) => Promise<CustomPlaylist[]>;
        addTrackToPlaylist: (playlistId: string, track: Track) => Promise<CustomPlaylist[]>;
        removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<CustomPlaylist[]>;
        recordPlay: (track: Track) => Promise<{
          playStats: Record<string, TrackPlayStat>;
          totalListeningSeconds: number;
        }>;
        exportM3U: (playlistId: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
        importM3U: () => Promise<{ ok: boolean; playlists?: CustomPlaylist[]; importedCount?: number }>;
        exportBackup: () => Promise<{ ok: boolean; path?: string }>;
        importBackup: () => Promise<{
          ok: boolean;
          error?: string;
          state?: {
            favorites: Track[];
            playlists: CustomPlaylist[];
            playStats: Record<string, TrackPlayStat>;
            totalListeningSeconds: number;
          };
        }>;
      };
      ai: {
        getConfig: () => Promise<{ configured: boolean; provider: 'openai' | 'openrouter' | 'gemini'; model: string; targetLanguage: string }>;
        configure: (input: { provider: 'openai' | 'openrouter' | 'gemini'; apiKey?: string; model?: string; targetLanguage?: string }) => Promise<{ ok: boolean; configured: boolean }>;
        translateLyrics: (lines: string[], targetLanguage?: string) => Promise<{ ok: boolean; translated?: string[]; language?: string; error?: string }>;
      };
      together: {
        startHost: (port?: number) => Promise<{ ok: boolean; url?: string; clients?: number; error?: string }>;
        stopHost: () => Promise<{ ok: boolean }>;
        broadcast: (state: {
          track: Track | null;
          isPlaying: boolean;
          position: number;
          updatedAt: number;
        }) => Promise<{ ok: boolean; clients: number }>;
        getHostStatus: () => Promise<{ hosting: boolean; clients: number }>;
      };
      podcasts: {
        search: (query: string) => Promise<Array<{ id: string; title: string; author: string; feedUrl: string; artwork?: string; description?: string }>>;
        getFeed: (feedUrl: string) => Promise<{
          show: { id: string; title: string; author: string; feedUrl: string; artwork?: string; description?: string };
          episodes: Array<{ id: string; title: string; audioUrl: string; duration: number; pubDate?: string; description?: string; thumbnail?: string; showTitle: string }>;
        }>;
        listSubscriptions: () => Promise<Array<{ id: string; title: string; author: string; feedUrl: string; artwork?: string; description?: string }>>;
        subscribe: (show: object) => Promise<Array<{ id: string; title: string; author: string; feedUrl: string; artwork?: string; description?: string }>>;
        unsubscribe: (feedUrl: string) => Promise<Array<{ id: string; title: string; author: string; feedUrl: string; artwork?: string; description?: string }>>;
      };
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      checkUpdates: () => Promise<{
        ok: boolean;
        currentVersion: string;
        latestVersion?: string;
        hasUpdate?: boolean;
        url?: string;
        error?: string;
      }>;
      openExternal: (url: string) => void;
      onTrayAction: (cb: (action: 'toggle' | 'prev' | 'next') => void) => () => void;
    };
  }
}

let fallbackAudio: HTMLAudioElement | null = null;
let incomingAudio: HTMLAudioElement | null = null;
let crossfadeTimer: ReturnType<typeof setInterval> | null = null;
let crossfadeTriggeredForId: string | null = null;
let usingHtml5Fallback = false;
let playbackStartTimestamp = 0;
let fallbackEndedHandler: (() => void) | null = null;
let activeSkipSegments: Array<{ start: number; end: number; category: string }> = [];
let lastSkippedEnd = -1;
let togetherWs: WebSocket | null = null;
let togetherSyncLock = false;

function broadcastTogetherSnapshot(positionOverride?: number) {
  if (togetherSyncLock || !useTogetherStore.getState().hostingUrl) return;
  const { currentTrack: ct, isPlaying: playing, position } = usePlayerStore.getState();
  window.electronAPI?.together
    ?.broadcast({
      track: ct
        ? {
            id: ct.id,
            title: ct.title,
            artist: ct.artist,
            album: ct.album,
            thumbnail: ct.thumbnail,
            duration: ct.duration,
            source: ct.source,
          }
        : null,
      isPlaying: playing,
      position: typeof positionOverride === 'number' ? positionOverride : position,
      updatedAt: Date.now(),
    })
    .then((res) => {
      const curUrl = useTogetherStore.getState().hostingUrl;
      if (res?.ok && curUrl) {
        useTogetherStore.getState().setHosting(curUrl, res.clients);
      }
    })
    .catch(() => {});
}

async function resolveTrackStream(track: Track): Promise<{ url: string; ytVideoId: string | null }> {
  const api = window.electronAPI;
  if (!api) throw new Error('Electron API unavailable');

  if (track.source === 'local' && track.path) {
    return { url: `file://${track.path.replace(/\\/g, '/')}`, ytVideoId: null };
  }
  if (track.source === 'podcast' && track.path) {
    return { url: track.path, ytVideoId: null };
  }
  if (track.source === 'spotify') {
    const resolved = await api.spotify.resolveTrack({ title: track.title, artist: track.artist });
    if (!resolved.url) throw new Error('Could not resolve Spotify audio stream');
    return { url: resolved.url, ytVideoId: resolved.id };
  }
  const res = await api.ytmusic.getStreamUrl(track.id);
  if (!res.ok || !res.url) throw new Error(res.error ?? 'No stream URL');
  return { url: res.url, ytVideoId: track.id };
}

function clearHtml5Crossfade() {
  if (crossfadeTimer) {
    clearInterval(crossfadeTimer);
    crossfadeTimer = null;
  }
  if (incomingAudio) {
    incomingAudio.pause();
    incomingAudio.removeAttribute('src');
    incomingAudio.load();
    incomingAudio = null;
  }
}

function maybeSkipSponsorSegment(pos: number, seekFn: (sec: number) => void) {
  if (!usePlayerStore.getState().sponsorBlockEnabled || activeSkipSegments.length === 0) return;
  for (const seg of activeSkipSegments) {
    if (pos >= seg.start && pos < seg.end - 0.8 && Math.abs(lastSkippedEnd - seg.end) > 0.5) {
      lastSkippedEnd = seg.end;
      seekFn(seg.end);
      return;
    }
  }
}

function attachFallbackListeners(audio: HTMLAudioElement) {
  audio.ontimeupdate = () => {
    if (!usingHtml5Fallback || fallbackAudio !== audio) return;
    const store = usePlayerStore.getState();
    const pos = audio.currentTime || 0;
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : store.duration;
    store.setPosition(pos);
    if (dur > 0 && dur !== store.duration) {
      store.setDuration(dur);
    }

    maybeSkipSponsorSegment(pos, (target) => {
      audio.currentTime = target;
    });

    // Dual-element HTML5 crossfade for Windows/portable runs without mpv
    const cfSec = store.crossfade;
    const activeTrack = store.currentTrack;
    if (
      cfSec > 0 &&
      activeTrack &&
      store.repeat !== 'one' &&
      dur > cfSec + 3 &&
      pos >= dur - cfSec &&
      crossfadeTriggeredForId !== activeTrack.id &&
      !crossfadeTimer
    ) {
      crossfadeTriggeredForId = activeTrack.id;
      void startHtml5Crossfade(cfSec);
    }
  };

  audio.onloadedmetadata = () => {
    if (!usingHtml5Fallback || fallbackAudio !== audio) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      usePlayerStore.getState().setDuration(audio.duration);
    }
  };

  audio.onended = () => {
    if (!usingHtml5Fallback || fallbackAudio !== audio || crossfadeTimer) return;
    fallbackEndedHandler?.();
  };
}

async function startHtml5Crossfade(crossfadeSec: number) {
  const store = usePlayerStore.getState();
  const next = store.nextTrack();
  if (!next || !fallbackAudio) return;

  try {
    const { url, ytVideoId } = await resolveTrackStream(next);
    if (!usingHtml5Fallback || !fallbackAudio) return;

    const outgoing = fallbackAudio;
    const targetVol = Math.max(0, Math.min(1, usePlayerStore.getState().volume));
    const nextEl = new Audio(url);
    nextEl.preload = 'auto';
    nextEl.volume = 0;
    nextEl.playbackRate = usePlayerStore.getState().speed || 1;
    incomingAudio = nextEl;
    await nextEl.play();

    // Update UI/metadata immediately as incoming track fades in
    usePlayerStore.getState().setCurrentTrack(next);
    usePlayerStore.getState().setPosition(0);
    playbackStartTimestamp = Math.floor(Date.now() / 1000);
    activeSkipSegments = [];
    lastSkippedEnd = -1;
    if (ytVideoId && usePlayerStore.getState().sponsorBlockEnabled) {
      window.electronAPI?.sponsorblock
        ?.getSegments(ytVideoId)
        .then((segs) => {
          if (usePlayerStore.getState().currentTrack?.id === next.id) {
            activeSkipSegments = segs || [];
          }
        })
        .catch(() => {});
    }

    const totalMs = Math.max(500, crossfadeSec * 1000);
    const startTime = Date.now();
    crossfadeTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / totalMs);
      const volNow = Math.max(0, Math.min(1, usePlayerStore.getState().volume));
      outgoing.volume = Math.max(0, volNow * (1 - t));
      nextEl.volume = Math.min(volNow, volNow * t);

      if (t >= 1) {
        if (crossfadeTimer) clearInterval(crossfadeTimer);
        crossfadeTimer = null;
        outgoing.pause();
        outgoing.removeAttribute('src');
        outgoing.load();
        fallbackAudio = nextEl;
        incomingAudio = null;
        nextEl.volume = targetVol;
        attachFallbackListeners(nextEl);
      }
    }, 80);
  } catch {
    clearHtml5Crossfade();
  }
}

function getFallbackAudio(): HTMLAudioElement {
  if (!fallbackAudio) {
    fallbackAudio = new Audio();
    fallbackAudio.preload = 'auto';
    attachFallbackListeners(fallbackAudio);
  }
  return fallbackAudio;
}

function stopFallbackAudio() {
  clearHtml5Crossfade();
  crossfadeTriggeredForId = null;
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
    usePlayerStore.getState().setPlaybackError(null);
    setCurrentTrack(track);
    setIsPlaying(false);
    setPosition(0);

    try {
      activeSkipSegments = [];
      lastSkippedEnd = -1;
      crossfadeTriggeredForId = null;
      clearHtml5Crossfade();
      const { url, ytVideoId } = await resolveTrackStream(track);

      if (ytVideoId && usePlayerStore.getState().sponsorBlockEnabled) {
        api.sponsorblock
          ?.getSegments(ytVideoId)
          .then((segs) => {
            if (usePlayerStore.getState().currentTrack?.id === track.id) {
              activeSkipSegments = segs || [];
            }
          })
          .catch(() => {});
      }

      const playRes = await api.player.play(url, {
        title: track.title,
        artist: track.artist,
        album: track.album ?? '',
      });

      const storeSnapshot = usePlayerStore.getState();
      if (playRes?.ok) {
        stopFallbackAudio();
        await api.player.setVolume(volume);
        if (storeSnapshot.speed !== 1.0) await api.player.setSpeed(storeSnapshot.speed);
        if (storeSnapshot.normalization) await api.player.setNormalization(true);
        if (storeSnapshot.eqBands.some((b) => Math.abs(b) >= 0.5)) {
          await api.player.setEqualizer(storeSnapshot.eqBands);
        }
      } else {
        // Fallback to Chromium HTML5 Audio when mpv isn't available on host
        usingHtml5Fallback = true;
        const audio = getFallbackAudio();
        audio.src = url;
        audio.volume = Math.max(0, Math.min(1, volume));
        audio.playbackRate = storeSnapshot.speed || 1;
        await audio.play();
      }

      setIsPlaying(true);
      setLoading(false);
      playbackStartTimestamp = Math.floor(Date.now() / 1000);

      api.storage
        ?.recordPlay(track)
        .then((stats) => {
          if (stats) useLibraryStore.getState().setStats(stats.playStats, stats.totalListeningSeconds);
        })
        .catch(() => {});

      api.scrobble.updateNowPlaying({
        artist: track.artist,
        track: track.title,
        album: track.album,
        duration: track.duration,
      }).catch(() => {/* ignore if not configured */});

    } catch (err: any) {
      const sourceLabel =
        track.source === 'spotify' ? 'Spotify' : track.source === 'local' ? 'Local File' : 'YouTube Music';
      const detail = err?.message || String(err);
      console.error('playTrack error', err);
      usePlayerStore.getState().setPlaybackError(`${sourceLabel}: ${detail}`);
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
    broadcastTogetherSnapshot(seconds);
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

  const changeEq = useCallback(async (bands: number[], preset?: string) => {
    usePlayerStore.getState().setEqualizer(bands, preset);
    if (!usingHtml5Fallback) {
      await window.electronAPI?.player.setEqualizer(bands);
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

  const leaveTogetherRoom = useCallback(() => {
    if (togetherWs) {
      togetherWs.close();
      togetherWs = null;
    }
    useTogetherStore.getState().setConnected(null);
    useTogetherStore.getState().setTogetherStatus('Disconnected from room');
  }, []);

  const startTogetherHost = useCallback(async () => {
    leaveTogetherRoom();
    const res = await window.electronAPI?.together?.startHost(47820);
    if (res?.ok && res.url) {
      useTogetherStore.getState().setHosting(res.url, res.clients || 0);
      useTogetherStore.getState().setTogetherStatus(`Hosting room at ${res.url}`);
      broadcastTogetherSnapshot();
    } else {
      useTogetherStore.getState().setTogetherStatus(res?.error || 'Failed to start Together host');
    }
    return res;
  }, [leaveTogetherRoom]);

  const stopTogetherHost = useCallback(async () => {
    await window.electronAPI?.together?.stopHost();
    useTogetherStore.getState().setHosting(null, 0);
    useTogetherStore.getState().setTogetherStatus('Stopped hosting room');
  }, []);

  const joinTogetherRoom = useCallback((rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    const normalized = /^wss?:\/\//i.test(trimmed) ? trimmed : `ws://${trimmed}`;
    if (useTogetherStore.getState().hostingUrl) {
      stopTogetherHost().catch(() => {});
    }
    leaveTogetherRoom();
    useTogetherStore.getState().setTogetherStatus(`Connecting to ${normalized}...`);

    try {
      const ws = new WebSocket(normalized);
      togetherWs = ws;

      ws.onopen = () => {
        useTogetherStore.getState().setConnected(normalized);
        useTogetherStore.getState().setTogetherStatus(`Connected to ${normalized}`);
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.type !== 'state') return;
          const remoteTrack = msg.track as Track | null;
          const remotePlaying = Boolean(msg.isPlaying);
          const remotePos = Number(msg.position || 0);

          togetherSyncLock = true;
          try {
            const state = usePlayerStore.getState();
            if (!remoteTrack) {
              if (state.isPlaying) await pause();
              return;
            }
            if (state.currentTrack?.id !== remoteTrack.id) {
              await playTrack(remoteTrack);
              if (remotePos > 2) {
                await seek(remotePos);
              }
              if (!remotePlaying) {
                await pause();
              }
            } else {
              if (remotePlaying !== state.isPlaying) {
                if (remotePlaying) await resume();
                else await pause();
              }
              if (Math.abs(state.position - remotePos) > 2.5) {
                await seek(remotePos);
              }
            }
          } finally {
            togetherSyncLock = false;
          }
        } catch {
          // Ignore malformed payloads
        }
      };

      ws.onerror = () => {
        useTogetherStore.getState().setTogetherStatus('Connection error — check LAN IP/port & firewall');
      };

      ws.onclose = () => {
        if (togetherWs === ws) togetherWs = null;
        if (useTogetherStore.getState().connectedUrl === normalized) {
          useTogetherStore.getState().setConnected(null);
          useTogetherStore.getState().setTogetherStatus('Disconnected from host');
        }
      };
    } catch {
      useTogetherStore.getState().setTogetherStatus('Invalid WebSocket room URL');
    }
  }, [leaveTogetherRoom, pause, playTrack, resume, seek, stopTogetherHost]);

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
    changeEq,
    downloadCurrentTrack,
    startTogetherHost,
    stopTogetherHost,
    joinTogetherRoom,
    leaveTogetherRoom,
  };
}

let globalEventsRegistered = false;

export function usePlayerEvents() {
  const { currentTrack, isPlaying, discordRpcEnabled, setPosition, setDuration } = usePlayerStore();
  const { skipNext, skipPrev, pause, resume, seek } = usePlayer();

  // Broadcast state to Together Mode LAN listeners on track / playback changes
  useEffect(() => {
    broadcastTogetherSnapshot();
  }, [currentTrack, isPlaying]);

  // Sync Discord Rich Presence on track/play state changes
  useEffect(() => {
    const discordApi = window.electronAPI?.discord;
    if (!discordApi) return;
    if (!discordRpcEnabled || !currentTrack || !isPlaying) {
      discordApi.setActivity(null).catch(() => {});
      return;
    }
    const { position, duration } = usePlayerStore.getState();
    discordApi
      .setActivity({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        thumbnail: currentTrack.thumbnail,
        duration: duration || currentTrack.duration,
        position,
      })
      .catch(() => {});
  }, [currentTrack, isPlaying, discordRpcEnabled]);

  // Sync Windows SMTC / Linux MPRIS metadata & hardware media keys
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album || 'ArchiveTune',
        artwork: currentTrack.thumbnail
          ? [{ src: currentTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
          : [],
      });
    } else {
      navigator.mediaSession.metadata = null;
    }
  }, [currentTrack]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => { resume(); });
    ms.setActionHandler('pause', () => { pause(); });
    ms.setActionHandler('previoustrack', () => { skipPrev(); });
    ms.setActionHandler('nexttrack', () => { skipNext(); });
    ms.setActionHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') seek(details.seekTime);
    });
    return () => {
      ms.setActionHandler('play', null);
      ms.setActionHandler('pause', null);
      ms.setActionHandler('previoustrack', null);
      ms.setActionHandler('nexttrack', null);
      ms.setActionHandler('seekto', null);
    };
  }, [resume, pause, skipPrev, skipNext, seek]);

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

    api.storage
      ?.getState()
      .then((data) => {
        if (!data) return;
        const lib = useLibraryStore.getState();
        lib.setFavorites(data.favorites || []);
        lib.setCustomPlaylists(data.playlists || []);
        lib.setStats(data.playStats || {}, data.totalListeningSeconds || 0);
      })
      .catch(() => {});

    const unsubProgress = api.player.onProgress((info: any) => {
      if (usingHtml5Fallback) return;
      setPosition(info.position);
      setDuration(info.duration);
      maybeSkipSponsorSegment(info.position, (target) => {
        api.player.seek(target);
      });
    });

    const unsubEnded = api.player.onEnded(handleTrackEnded);

    const unsubTray = api.onTrayAction?.((action) => {
      if (action === 'toggle') {
        if (usePlayerStore.getState().isPlaying) pause();
        else resume();
      } else if (action === 'next') {
        skipNext();
      } else if (action === 'prev') {
        skipPrev();
      }
    });

    return () => {
      fallbackEndedHandler = null;
      unsubProgress();
      unsubEnded();
      unsubTray?.();
      globalEventsRegistered = false;
    };
  }, [setPosition, setDuration, skipNext, skipPrev, pause, resume]);
}
