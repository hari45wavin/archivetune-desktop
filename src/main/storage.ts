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
  source: 'youtube' | 'local' | 'spotify' | 'podcast';
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

  ipcMain.handle('storage:importM3U', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'M3U Playlist', extensions: ['m3u', 'm3u8'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false };

    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).map((l) => l.trim());

    let playlistName = path.basename(filePath, path.extname(filePath));
    let pendingTitle = '';
    let pendingArtist = 'Unknown Artist';
    let pendingDuration = 0;
    const importedTracks: StoredTrack[] = [];

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('#PLAYLIST:')) {
        const name = line.slice(10).trim();
        if (name) playlistName = name;
        continue;
      }
      if (line.startsWith('#EXTINF:')) {
        const commaIdx = line.indexOf(',');
        const durPart = commaIdx > 8 ? Number(line.slice(8, commaIdx)) : 0;
        pendingDuration = Number.isFinite(durPart) && durPart > 0 ? durPart : 0;
        const label = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';
        const dashIdx = label.indexOf(' - ');
        if (dashIdx > 0) {
          pendingArtist = label.slice(0, dashIdx).trim() || 'Unknown Artist';
          pendingTitle = label.slice(dashIdx + 3).trim() || label;
        } else {
          pendingTitle = label;
          pendingArtist = 'Unknown Artist';
        }
        continue;
      }
      if (line.startsWith('#')) continue;

      const ytMatch = line.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) {
        importedTracks.push({
          id: ytMatch[1],
          title: pendingTitle || `YouTube Track (${ytMatch[1]})`,
          artist: pendingArtist,
          duration: pendingDuration,
          thumbnail: `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`,
          source: 'youtube',
        });
      } else {
        const resolvedPath = path.isAbsolute(line) ? line : path.resolve(path.dirname(filePath), line);
        importedTracks.push({
          id: resolvedPath,
          title: pendingTitle || path.basename(resolvedPath, path.extname(resolvedPath)),
          artist: pendingArtist,
          duration: pendingDuration,
          source: 'local',
          path: resolvedPath,
        });
      }
      pendingTitle = '';
      pendingArtist = 'Unknown Artist';
      pendingDuration = 0;
    }

    const data = loadStorage();
    const playlist: CustomPlaylist = {
      id: `pl-${crypto.randomUUID()}`,
      name: playlistName,
      tracks: importedTracks,
      createdAt: Date.now(),
    };
    data.playlists = [playlist, ...data.playlists];
    saveStorage(data);
    return { ok: true, playlists: data.playlists, importedCount: importedTracks.length };
  });

  ipcMain.handle('storage:exportBackup', async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: 'archivetune-backup.json',
      filters: [{ name: 'ArchiveTune Backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };

    const podcastsFile = path.join(app.getPath('userData'), 'podcasts-subs.json');
    let podcasts: unknown[] = [];
    try {
      if (fs.existsSync(podcastsFile)) {
        const parsed = JSON.parse(fs.readFileSync(podcastsFile, 'utf-8'));
        if (Array.isArray(parsed)) podcasts = parsed;
      }
    } catch {
      podcasts = [];
    }

    const payload = {
      app: 'ArchiveTune Desktop',
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      library: loadStorage(),
      podcasts,
    };
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle('storage:importBackup', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'ArchiveTune Backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false };

    try {
      const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
      const lib = parsed?.library ?? parsed;
      if (!lib || typeof lib !== 'object') return { ok: false, error: 'Invalid backup format' };

      const current = loadStorage();
      const existingFavIds = new Set(current.favorites.map((t) => t.id));
      const mergedFavs = [...current.favorites];
      for (const fav of Array.isArray(lib.favorites) ? lib.favorites : []) {
        if (fav?.id && !existingFavIds.has(fav.id)) {
          existingFavIds.add(fav.id);
          mergedFavs.push(fav);
        }
      }

      const existingPlIds = new Set(current.playlists.map((p) => p.id));
      const mergedPlaylists = [...current.playlists];
      for (const pl of Array.isArray(lib.playlists) ? lib.playlists : []) {
        if (pl?.id && !existingPlIds.has(pl.id)) {
          existingPlIds.add(pl.id);
          mergedPlaylists.push(pl);
        }
      }

      const mergedStats = { ...current.playStats };
      if (lib.playStats && typeof lib.playStats === 'object') {
        for (const [k, stat] of Object.entries<any>(lib.playStats)) {
          if (!stat?.track) continue;
          const prev = mergedStats[k];
          mergedStats[k] = prev
            ? {
                track: prev.track,
                playCount: Math.max(prev.playCount, Number(stat.playCount) || 0),
                lastPlayedAt: Math.max(prev.lastPlayedAt, Number(stat.lastPlayedAt) || 0),
              }
            : stat;
        }
      }

      const nextData: LibraryStorageData = {
        favorites: mergedFavs,
        playlists: mergedPlaylists,
        playStats: mergedStats,
        totalListeningSeconds: Math.max(
          current.totalListeningSeconds,
          Number(lib.totalListeningSeconds) || 0
        ),
      };
      saveStorage(nextData);

      if (Array.isArray(parsed?.podcasts) && parsed.podcasts.length > 0) {
        const podcastsFile = path.join(app.getPath('userData'), 'podcasts-subs.json');
        let curSubs: any[] = [];
        try {
          if (fs.existsSync(podcastsFile)) {
            const existing = JSON.parse(fs.readFileSync(podcastsFile, 'utf-8'));
            if (Array.isArray(existing)) curSubs = existing;
          }
        } catch {
          curSubs = [];
        }
        const seenFeeds = new Set(curSubs.map((s) => s.feedUrl));
        for (const show of parsed.podcasts) {
          if (show?.feedUrl && !seenFeeds.has(show.feedUrl)) {
            seenFeeds.add(show.feedUrl);
            curSubs.push(show);
          }
        }
        fs.writeFileSync(podcastsFile, JSON.stringify(curSubs, null, 2), 'utf-8');
      }

      return { ok: true, state: nextData };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to read backup file' };
    }
  });
}
