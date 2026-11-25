/**
 * storage.ts — Zero-dependency persistent JSON store for favorites, playlists, and listening stats
 */

import { app, dialog, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface StoredTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail?: string;
  duration: number;
  source: 'youtube' | 'local' | 'spotify';
  path?: string;
}

export interface CustomPlaylist {
  id: string;
  name: string;
  tracks: StoredTrack[];
  createdAt: number;
}

export interface TrackPlayStat {
  track: StoredTrack;
  playCount: number;
  lastPlayedAt: number;
}

export interface LibraryStorageData {
  favorites: StoredTrack[];
  playlists: CustomPlaylist[];
  playStats: Record<string, TrackPlayStat>;
  totalListeningSeconds: number;
}

const DEFAULT_DATA: LibraryStorageData = {
  favorites: [],
  playlists: [],
  playStats: {},
  totalListeningSeconds: 0,
};

let cache: LibraryStorageData | null = null;

function getStoragePath(): string {
  return path.join(app.getPath('userData'), 'library-data.json');
}

function loadStorage(): LibraryStorageData {
  if (cache) return cache;
  try {
    const file = getStoragePath();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      cache = {
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
        playStats: parsed.playStats && typeof parsed.playStats === 'object' ? parsed.playStats : {},
        totalListeningSeconds: Number(parsed.totalListeningSeconds) || 0,
      };
      return cache;
    }
  } catch (err) {
    console.warn('Failed to load library-data.json:', err);
  }
  cache = { ...DEFAULT_DATA, favorites: [], playlists: [], playStats: {} };
  return cache;
}

function saveStorage(data: LibraryStorageData) {
  cache = data;
  try {
    const file = getStoragePath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to save library-data.json:', err);
  }
}

export function setupStorageIPC() {
  ipcMain.handle('storage:getState', () => loadStorage());

  ipcMain.handle('storage:toggleFavorite', (_e, track: StoredTrack) => {
    const data = loadStorage();
    const exists = data.favorites.some((t) => t.id === track.id);
    data.favorites = exists
      ? data.favorites.filter((t) => t.id !== track.id)
      : [track, ...data.favorites];
    saveStorage(data);
    return data.favorites;
  });

  ipcMain.handle('storage:createPlaylist', (_e, name: string) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return loadStorage().playlists;
    const data = loadStorage();
    const playlist: CustomPlaylist = {
      id: `pl-${crypto.randomUUID()}`,
      name: trimmed,
      tracks: [],
      createdAt: Date.now(),
    };
    data.playlists = [playlist, ...data.playlists];
    saveStorage(data);
    return data.playlists;
  });

  ipcMain.handle('storage:deletePlaylist', (_e, playlistId: string) => {
    const data = loadStorage();
    data.playlists = data.playlists.filter((p) => p.id !== playlistId);
    saveStorage(data);
    return data.playlists;
  });

  ipcMain.handle('storage:addTrackToPlaylist', (_e, playlistId: string, track: StoredTrack) => {
    const data = loadStorage();
    data.playlists = data.playlists.map((p) => {
      if (p.id !== playlistId) return p;
      if (p.tracks.some((t) => t.id === track.id)) return p;
      return { ...p, tracks: [...p.tracks, track] };
    });
    saveStorage(data);
    return data.playlists;
  });

  ipcMain.handle('storage:removeTrackFromPlaylist', (_e, playlistId: string, trackId: string) => {
    const data = loadStorage();
    data.playlists = data.playlists.map((p) =>
      p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p
    );
    saveStorage(data);
    return data.playlists;
  });

  ipcMain.handle('storage:recordPlay', (_e, track: StoredTrack) => {
    const data = loadStorage();
    const prev = data.playStats[track.id];
    data.playStats[track.id] = {
      track,
      playCount: (prev?.playCount || 0) + 1,
      lastPlayedAt: Date.now(),
    };
    if (track.duration > 0 && track.duration < 3600) {
      data.totalListeningSeconds += Math.round(track.duration);
    }
    saveStorage(data);
    return {
      playStats: data.playStats,
      totalListeningSeconds: data.totalListeningSeconds,
    };
  });

  ipcMain.handle('storage:exportM3U', async (_e, playlistId: string) => {
    const data = loadStorage();
    const playlist = data.playlists.find((p) => p.id === playlistId);
    if (!playlist) return { ok: false, error: 'Playlist not found' };

    const safeName = playlist.name.replace(/[\\/:*?"<>|]/g, '_');
    const result = await dialog.showSaveDialog({
      defaultPath: `${safeName}.m3u8`,
      filters: [{ name: 'M3U Playlist', extensions: ['m3u8', 'm3u'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };

    const lines = ['#EXTM3U', `#PLAYLIST:${playlist.name}`];
    for (const t of playlist.tracks) {
      lines.push(`#EXTINF:${Math.round(t.duration || -1)},${t.artist} - ${t.title}`);
      lines.push(t.source === 'local' && t.path ? t.path : `https://www.youtube.com/watch?v=${t.id}`);
    }
    fs.writeFileSync(result.filePath, lines.join('\n'), 'utf-8');
    return { ok: true, path: result.filePath };
  });
}
