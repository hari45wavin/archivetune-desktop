/**
 * lyrics.ts — Multi-source synced lyrics fetcher with smart title cleanup
 *
 * Waterfall: LRCLib (Synced) → YouTube Music ANDROID_MUSIC (Synced) → LRCLib (Plain) → YouTube Music (Plain)
 * Returns LRC-format timestamped lines and plain text for the renderer.
 */

import { ipcMain, net } from 'electron';

const ANDROID_MUSIC_CONTEXT = {
  client: {
    clientName: 'ANDROID_MUSIC',
    clientVersion: '7.27.52',
    androidSdkVersion: 34,
    osName: 'Android',
    osVersion: '14',
  },
};
const ANDROID_MUSIC_UA = 'com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 14; en_US) gzip';

interface LyricLine {
  time: number; // seconds
  text: string;
}

interface LyricsResult {
  synced: LyricLine[];
  plain: string;
  source: string;
}

async function httpFetchText(url: string, init?: RequestInit): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await net.fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': 'ArchiveTune-Desktop/1.0 (https://github.com/hari45wavin/archivetune-desktop)',
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
  for (const line of lrc.split('\n')) {
    const m = line.match(re);
    if (m) {
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const ms = parseInt(m[3].padEnd(3, '0'), 10);
      const text = m[4].trim();
      if (text) {
        lines.push({ time: mins * 60 + secs + ms / 1000, text });
      }
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

function cleanTitle(rawTitle: string): string {
  let t = rawTitle
    .replace(/\s*[\(\[](?:Official\s*(?:Music\s*)?(?:Video|Audio|Visualizer|Lyric\s*Video)?|Lyrics|HD|HQ|Remastered|4K|Full\s*Song|Video|Audio)[\)\]]/gi, '')
    .replace(/\s*[\(\[]From\s*["'].*?["'][\)\]]/gi, '')
    .replace(/\s*[\(\[]feat\..*?[\)\]]/gi, '')
    .replace(/\|\s*.*$/g, '')
    .trim();

  // If title is "Artist - Title", extract title
  const parts = t.split(/\s*[-–—]\s*/);
  if (parts.length > 1) {
    t = parts[parts.length - 1].trim();
  }
  return t;
}

function cleanArtist(rawArtist: string): string {
  return rawArtist
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/\s*Official$/i, '')
    .replace(/\s*and\s*\d+\s*more$/i, '')
    .trim();
}

async function fetchLRCLib(title: string, artist: string, duration: number): Promise<LyricsResult | null> {
  const cleanT = cleanTitle(title);
  const cleanA = cleanArtist(artist);

  // 1. Try cleaned exact match
  try {
    const params = new URLSearchParams({
      track_name: cleanT,
      artist_name: cleanA,
    });
    if (duration > 0) params.append('duration', String(Math.round(duration)));

    const data = await httpFetchText(`https://lrclib.net/api/get?${params}`);
    const json = JSON.parse(data);
    if (json.syncedLyrics) {
      return {
        synced: parseLRC(json.syncedLyrics),
        plain: json.plainLyrics ?? '',
        source: 'LRCLib Synced',
      };
    }
    if (json.plainLyrics) {
      return { synced: [], plain: json.plainLyrics, source: 'LRCLib Plain' };
    }
  } catch { /* fall through */ }

  // 2. Try search with cleaned title + artist
  try {
    const params = new URLSearchParams({ q: `${cleanA} ${cleanT}` });
    const data = await httpFetchText(`https://lrclib.net/api/search?${params}`);
    const results = JSON.parse(data);
    if (Array.isArray(results) && results.length > 0) {
      // Find item with closest duration or first synced
      const syncedBest = results.find((r: any) => r.syncedLyrics);
      const best = syncedBest || results[0];
      if (best.syncedLyrics) {
        return {
          synced: parseLRC(best.syncedLyrics),
          plain: best.plainLyrics ?? '',
          source: 'LRCLib Synced',
        };
      }
      if (best.plainLyrics) {
        return { synced: [], plain: best.plainLyrics, source: 'LRCLib Plain' };
      }
    }
  } catch { /* fall through */ }

  return null;
}

function findTimedLyricsData(node: any): any[] | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node.timedLyricsData)) return node.timedLyricsData;
  for (const val of Object.values(node)) {
    if (val && typeof val === 'object') {
      const found = findTimedLyricsData(val);
      if (found) return found;
    }
  }
  return null;
}

function findPlainDescriptionLyrics(node: any): string | null {
  if (!node || typeof node !== 'object') return null;
  if (node.musicDescriptionShelfRenderer?.description?.runs) {
    return node.musicDescriptionShelfRenderer.description.runs.map((r: any) => r.text).join('').trim();
  }
  for (const val of Object.values(node)) {
    if (val && typeof val === 'object') {
      const found = findPlainDescriptionLyrics(val);
      if (found) return found;
    }
  }
  return null;
}

async function fetchYouTubeMusicLyrics(videoId: string): Promise<LyricsResult | null> {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;

  try {
    const nextText = await httpFetchText('https://music.youtube.com/youtubei/v1/next?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': ANDROID_MUSIC_UA },
      body: JSON.stringify({ context: ANDROID_MUSIC_CONTEXT, videoId }),
    });
    const browseMatch = nextText.match(/"browseId":"(MPLYt_[^"]+)"/);
    if (!browseMatch) return null;

    const browseText = await httpFetchText('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': ANDROID_MUSIC_UA },
      body: JSON.stringify({ context: ANDROID_MUSIC_CONTEXT, browseId: browseMatch[1] }),
    });
    const browseJson = JSON.parse(browseText);

    const timed = findTimedLyricsData(browseJson);
    if (timed && timed.length > 0) {
      const synced: LyricLine[] = [];
      const plainLines: string[] = [];
      for (const entry of timed) {
        const lineText = String(entry?.lyricLine ?? '').trim();
        if (!lineText) continue;
        plainLines.push(lineText);
        const startMs = Number(entry?.cueRange?.startTimeMilliseconds);
        if (Number.isFinite(startMs) && startMs >= 0) {
          synced.push({ time: startMs / 1000, text: lineText });
        }
      }
      if (synced.length > 0) {
        return {
          synced: synced.sort((a, b) => a.time - b.time),
          plain: plainLines.join('\n'),
          source: 'YouTube Music Synced',
        };
      }
      if (plainLines.length > 0) {
        return { synced: [], plain: plainLines.join('\n'), source: 'YouTube Music' };
      }
    }

    const plainDesc = findPlainDescriptionLyrics(browseJson);
    if (plainDesc) {
      return { synced: [], plain: plainDesc, source: 'YouTube Music' };
    }
  } catch { /* fall through */ }

  return null;
}

export function setupLyricsIPC() {
  ipcMain.handle('lyrics:get', async (_e, title: string, artist: string, duration: number, videoId?: string) => {
    try {
      const lrcResult = await fetchLRCLib(title, artist, duration);
      if (lrcResult && lrcResult.synced.length > 0) return lrcResult;

      if (videoId) {
        const ytResult = await fetchYouTubeMusicLyrics(videoId);
        if (ytResult && ytResult.synced.length > 0) return ytResult;
        if (lrcResult) return lrcResult;
        if (ytResult) return ytResult;
      } else if (lrcResult) {
        return lrcResult;
      }
    } catch (err) {
      console.error('lyrics:get error', err);
    }
    return { synced: [], plain: '', source: 'none' };
  });
}
