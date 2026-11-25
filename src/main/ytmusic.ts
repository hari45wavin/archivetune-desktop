/**
 * ytmusic.ts — YouTube Music Live Integration via InnerTube & yt-dlp
 *
 * Uses Chromium's network stack (electron.net.fetch) for fast, VPN/proxy-friendly
 * InnerTube browsing/search/stream resolution, with resolved yt-dlp as fallback.
 */

import { ipcMain, net } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolveBinary, resolveSystemProxy } from './binaries';

const execFileAsync = promisify(execFile);

const WEB_REMIX_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20250204.01.00',
    hl: 'en',
    gl: 'US',
  },
};

const PLAYER_CLIENTS = [
  {
    name: 'ANDROID_VR',
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    context: {
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.56.21',
        androidSdkVersion: 32,
        osName: 'Android',
        osVersion: '12L',
      },
    },
  },
  {
    name: 'IOS',
    userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
    context: {
      client: {
        clientName: 'IOS',
        clientVersion: '19.29.1',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iOS',
        osVersion: '17.5.1.21F90',
      },
    },
  },
];

const WEB_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface SearchResult {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  album?: string;
}

const CATEGORY_PLAYLISTS: Record<string, string> = {
  trending: 'VLPL4fGSI1pDJn5kI81J1fYWK5eZRl1zJ5kM',
  global_top: 'VLPL4fGSI1pDJn6jXS_PEoN9oe32PUTrNwZ3',
};

const CATEGORY_QUERIES: Record<string, string[]> = {
  trending: [
    'https://www.youtube.com/playlist?list=PL4fGSI1pDJn5kI81J1fYWK5eZRl1zJ5kM',
    'trending music songs hits official audio 2026',
  ],
  global_top: [
    'https://www.youtube.com/playlist?list=PL4fGSI1pDJn6jXS_PEoN9oe32PUTrNwZ3',
    'top 50 global hits music songs 2026',
  ],
  hindi: [
    'latest hindi songs bollywood 2026',
    'top bollywood romantic hits 2026',
  ],
  mixes: [
    'top music mix bollywood chill 2026',
    'hindi acoustic lofi mix songs',
  ],
  pop: [
    'top pop music hits songs 2026',
  ],
  lofi: [
    'lofi vibe hindi chill relax songs',
    'chill lofi hip hop beats',
  ],
  romantic: [
    'best romantic love songs hindi english',
  ],
  hiphop: [
    'top hip hop rap hits 2026',
  ],
};

function cleanTitle(raw: string): string {
  return (
    raw
      .replace(
        /\s*[([{\u3010\uff08].*?(Official|Music Video|Video|Audio|Lyric|4K|HD|Full Song|Visualizer|Teaser|Remastered).*?[)\]}\u3011\uff09]/gi,
        ''
      )
      .replace(/\|\s*@.*$/g, '')
      .replace(/\|\s*Full Video.*$/gi, '')
      .replace(/\|\s*Official Music Video.*$/gi, '')
      .trim() || raw
  );
}

function cleanArtist(raw: string): string {
  return (
    raw
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/\s*VEVO$/i, '')
      .replace(/\s*Official$/i, '')
      .trim() || raw
  );
}

function parseDurationText(str?: string): number {
  if (!str) return 0;
  const m = String(str).trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (!m) return 0;
  if (m[3]) return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function upgradeThumbnail(url: string | undefined, videoId: string): string {
  if (!url) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return url.replace(/=w\d+-h\d+-[^&"'\s]+$/, '=w544-h544-l90-rj');
}

function collectRenderers(node: any, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectRenderers(item, out);
    return out;
  }
  if (node.musicResponsiveListItemRenderer) {
    out.push(node.musicResponsiveListItemRenderer);
  }
  for (const val of Object.values(node)) {
    if (val && typeof val === 'object') collectRenderers(val, out);
  }
  return out;
}

const SKIP_SUBTITLE_TOKENS = new Set(['Song', 'Video', 'EP', 'Single', 'Album']);

function parseInnerTubeRenderer(r: any, filterDuration = true): SearchResult | null {
  let id: string | undefined =
    r?.playlistItemData?.videoId ||
    r?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchEndpoint?.videoId;

  const cols = r?.flexColumns || [];
  const getRuns = (idx: number): any[] =>
    cols[idx]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];

  const titleRuns = getRuns(0);
  if (!id) {
    id = titleRuns.find((x) => x?.navigationEndpoint?.watchEndpoint?.videoId)?.navigationEndpoint
      ?.watchEndpoint?.videoId;
  }
  if (!id) return null;

  const title = cleanTitle(titleRuns.map((x) => x.text).join('').trim());
  if (!title) return null;

  const subRuns = getRuns(1);
  const subParts = subRuns
    .map((x) => x.text)
    .join('')
    .split('•')
    .map((s) => s.trim())
    .filter((s) => s && !SKIP_SUBTITLE_TOKENS.has(s) && !/^\d[\d.,]*[KMB]?\s+(plays|views)$/i.test(s));

  const fixedRuns = r?.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs || [];
  let duration = parseDurationText(fixedRuns.map((x: any) => x.text).join('').trim());
  if (!duration && subParts.length > 0) {
    const maybeDur = parseDurationText(subParts[subParts.length - 1]);
    if (maybeDur > 0) {
      duration = maybeDur;
      subParts.pop();
    }
  }

  if (filterDuration && duration > 700) return null;

  const artist = cleanArtist(subParts[0] || 'YouTube Music');
  const thumbs = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const rawThumb = thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url : undefined;

  return {
    id,
    title,
    artist,
    thumbnail: upgradeThumbnail(rawThumb, id),
    duration,
    album: subParts[1] || undefined,
  };
}

async function fetchInnerTubeJson(url: string, body: object, userAgent = WEB_USER_AGENT): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await net.fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchInnerTubePlaylist(browseId: string, limit = 30): Promise<SearchResult[]> {
  const data = await fetchInnerTubeJson('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
    context: WEB_REMIX_CONTEXT,
    browseId,
  });
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const renderer of collectRenderers(data)) {
    const parsed = parseInnerTubeRenderer(renderer, true);
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id);
      results.push(parsed);
      if (results.length >= limit) break;
    }
  }
  return results;
}

async function fetchInnerTubeSearch(query: string, filterDuration = true, limit = 30): Promise<SearchResult[]> {
  const data = await fetchInnerTubeJson('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
    context: WEB_REMIX_CONTEXT,
    query: query.trim(),
    params: 'EgWKAQIIAWoKEAMQBBAJEAoQBQ%3D%3D', // Songs filter
  });
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const renderer of collectRenderers(data)) {
    const parsed = parseInnerTubeRenderer(renderer, filterDuration);
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id);
      results.push(parsed);
      if (results.length >= limit) break;
    }
  }
  return results;
}

/**
 * Shared yt-dlp runner using resolved bundled/system binary and active Chromium proxy.
 */
export async function runYtDlp(args: string[], timeoutMs = 30000): Promise<string> {
  const bin = resolveBinary('yt-dlp');
  if (!bin) {
    throw new Error('yt-dlp binary is not installed');
  }
  const finalArgs = [...args];
  const proxy = await resolveSystemProxy('https://www.youtube.com');
  if (proxy && !finalArgs.includes('--proxy')) {
    finalArgs.unshift('--proxy', proxy);
  }
  const { stdout } = await execFileAsync(bin, finalArgs, {
    timeout: timeoutMs,
    maxBuffer: 15 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

async function parseYtdlpOutput(stdout: string, filterDuration = true): Promise<SearchResult[]> {
  const lines = stdout.trim().split('\n').filter(Boolean);
  return lines
    .map((line) => {
      try {
        const item = JSON.parse(line);
        if (!item.id) return null;
        if (filterDuration && item.duration && item.duration > 700) return null;

        let thumb = item.thumbnail;
        if (!thumb && Array.isArray(item.thumbnails) && item.thumbnails.length > 0) {
          const sorted = [...item.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
          thumb = sorted[0]?.url;
        }
        if (!thumb) {
          thumb = `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
        }

        return {
          id: item.id,
          title: cleanTitle(item.title ?? 'Unknown Title'),
          artist: cleanArtist(item.uploader ?? item.channel ?? item.artist ?? 'YouTube Music'),
          thumbnail: thumb,
          duration: item.duration ?? 0,
          album: item.album ?? undefined,
        } as SearchResult;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as SearchResult[];
}

const categoryCache = new Map<string, { data: SearchResult[]; timestamp: number }>();
const CACHE_TTL_MS = 8 * 60 * 1000;

async function fetchCategoryOnline(category: string): Promise<SearchResult[]> {
  const filterDuration = category !== 'mixes';

  // 1. Try native InnerTube API first (instant, no external binary, works with Windows VPNs/proxies)
  try {
    const browseId = CATEGORY_PLAYLISTS[category];
    if (browseId) {
      const playlistTracks = await fetchInnerTubePlaylist(browseId, 30);
      if (playlistTracks.length > 0) {
        categoryCache.set(category, { data: playlistTracks, timestamp: Date.now() });
        return playlistTracks;
      }
    }

    const queries = CATEGORY_QUERIES[category] || [`${category} top songs 2026`];
    for (const q of queries) {
      if (q.startsWith('http')) continue;
      const searchTracks = await fetchInnerTubeSearch(q, filterDuration, 30);
      if (searchTracks.length > 0) {
        categoryCache.set(category, { data: searchTracks, timestamp: Date.now() });
        return searchTracks;
      }
    }
  } catch (err) {
    console.warn(`InnerTube fetch for ${category} failed, trying yt-dlp fallback:`, err);
  }

  // 2. Fallback to yt-dlp if available
  const queries = CATEGORY_QUERIES[category] || [`ytsearch30:${category} top songs 2026 -jukebox`];
  for (const target of queries) {
    const isPlaylist = target.startsWith('http');
    const args = ['--dump-json', '--flat-playlist', '--no-warnings', '--quiet'];
    if (isPlaylist) {
      args.push('--playlist-end', '30', target);
    } else {
      args.push(target.startsWith('ytsearch') ? target : `ytsearch30:${target}`);
    }

    try {
      const stdout = await runYtDlp(args, 35000);
      const results = await parseYtdlpOutput(stdout, filterDuration);
      if (results.length > 0) {
        categoryCache.set(category, { data: results, timestamp: Date.now() });
        return results;
      }
    } catch (err) {
      console.warn(`yt-dlp query ${target} failed:`, err);
    }
  }

  return [];
}

export async function getLiveCategory(category = 'trending', forceRefresh = false): Promise<SearchResult[]> {
  const cached = categoryCache.get(category);
  if (!forceRefresh && cached && cached.data.length > 0 && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const live = await fetchCategoryOnline(category);
  if (live.length > 0) return live;

  if (cached && cached.data.length > 0) return cached.data;
  return [];
}

export async function searchYouTubeMusic(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const innerTubeResults = await fetchInnerTubeSearch(trimmed, true, 30);
    if (innerTubeResults.length > 0) return innerTubeResults;
  } catch (err) {
    console.warn('InnerTube search failed, falling back to yt-dlp:', err);
  }

  const stdout = await runYtDlp([
    '--dump-json',
    '--flat-playlist',
    '--no-warnings',
    '--quiet',
    `ytsearch30:${trimmed}`,
  ]);
  return parseYtdlpOutput(stdout);
}

async function getStreamUrlViaInnerTube(videoId: string): Promise<string> {
  let lastError: Error = new Error('No playable audio stream found');

  for (const client of PLAYER_CLIENTS) {
    try {
      const data = await fetchInnerTubeJson(
        'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
        {
          context: client.context,
          videoId,
        },
        client.userAgent
      );

      if (data?.playabilityStatus?.status && data.playabilityStatus.status !== 'OK') {
        lastError = new Error(
          `${client.name}: ${data.playabilityStatus.reason || data.playabilityStatus.status}`
        );
        continue;
      }

      const adaptive = Array.isArray(data?.streamingData?.adaptiveFormats)
        ? data.streamingData.adaptiveFormats
        : [];
      const audioFormats = adaptive
        .filter((f: any) => typeof f?.mimeType === 'string' && f.mimeType.startsWith('audio/') && f.url)
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      const preferred =
        audioFormats.find((f: any) => f.mimeType.includes('audio/mp4')) ||
        audioFormats.find((f: any) => f.mimeType.includes('audio/webm')) ||
        audioFormats[0];

      if (preferred?.url) {
        return preferred.url;
      }
      lastError = new Error(`${client.name}: NO_FORMAT in streamingData`);
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError;
}

export async function getStreamUrl(videoId: string): Promise<string> {
  // 1. Prefer fast direct InnerTube player resolution via Chromium net.fetch (works with VPN/proxy & no yt-dlp needed)
  try {
    return await getStreamUrlViaInnerTube(videoId);
  } catch (err) {
    console.warn('InnerTube stream resolution failed, trying yt-dlp:', err);
  }

  // 2. Fallback to yt-dlp for restricted/ciphered tracks
  const stdout = await runYtDlp([
    '--no-playlist',
    '--format',
    'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
    '--get-url',
    '--quiet',
    `https://www.youtube.com/watch?v=${videoId}`,
  ]);

  const streamUrl = stdout.trim().split('\n')[0];
  if (!streamUrl) throw new Error('Failed to resolve audio stream URL');
  return streamUrl;
}

function collectPanelRenderers(node: any, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectPanelRenderers(item, out);
    return out;
  }
  if (node.playlistPanelVideoRenderer) {
    out.push(node.playlistPanelVideoRenderer);
  }
  for (const val of Object.values(node)) {
    if (val && typeof val === 'object') collectPanelRenderers(val, out);
  }
  return out;
}

function parsePanelRenderer(r: any): SearchResult | null {
  const id: string | undefined = r?.videoId || r?.navigationEndpoint?.watchEndpoint?.videoId;
  if (!id) return null;
  const title = cleanTitle(r?.title?.runs?.map((x: any) => x.text).join('').trim() || '');
  if (!title) return null;

  const bylineRuns = r?.longBylineText?.runs || r?.shortBylineText?.runs || [];
  const rawArtist = bylineRuns[0]?.text || 'YouTube Music';
  const duration = parseDurationText(r?.lengthText?.runs?.map((x: any) => x.text).join('').trim());
  const thumbs = r?.thumbnail?.thumbnails || [];
  const rawThumb = thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url : undefined;

  return {
    id,
    title,
    artist: cleanArtist(rawArtist),
    thumbnail: upgradeThumbnail(rawThumb, id),
    duration,
  };
}

export async function getSuggestedTracks(videoId: string): Promise<SearchResult[]> {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return [];
  const data = await fetchInnerTubeJson('https://music.youtube.com/youtubei/v1/next?prettyPrint=false', {
    context: WEB_REMIX_CONTEXT,
    videoId,
    playlistId: `RDAMVM${videoId}`,
    isAudioOnly: true,
  });

  const seen = new Set<string>([videoId]);
  const results: SearchResult[] = [];
  for (const renderer of collectPanelRenderers(data)) {
    const parsed = parsePanelRenderer(renderer);
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id);
      results.push(parsed);
      if (results.length >= 25) break;
    }
  }
  return results;
}

export function setupYTMusicIPC() {
  ipcMain.handle('ytmusic:getHome', async () => {
    try {
      const trending = await getLiveCategory('trending');
      return { trending };
    } catch (err) {
      console.error('ytmusic:getHome error', err);
      return { trending: [] };
    }
  });

  ipcMain.handle('ytmusic:getCategory', async (_e, category: string, forceRefresh = false) => {
    try {
      return await getLiveCategory(category, forceRefresh);
    } catch (err) {
      console.error('ytmusic:getCategory error', err);
      return [];
    }
  });

  ipcMain.handle('ytmusic:search', async (_e, query: string) => {
    try {
      return await searchYouTubeMusic(query);
    } catch (err) {
      console.error('ytmusic:search error', err);
      return [];
    }
  });

  ipcMain.handle('ytmusic:getStreamUrl', async (_e, videoId: string) => {
    try {
      const url = await getStreamUrl(videoId);
      return { url, ok: true };
    } catch (err: any) {
      console.error('ytmusic:getStreamUrl error', err);
      return { url: null, ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('ytmusic:getSuggested', async (_e, videoId: string) => {
    try {
      return await getSuggestedTracks(videoId);
    } catch (err) {
      console.error('ytmusic:getSuggested error', err);
      return [];
    }
  });

  ipcMain.handle('ytmusic:getPlaylist', async (_e, playlistId: string) => {
    try {
      const browseId = playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;
      return await fetchInnerTubePlaylist(browseId, 100);
    } catch (err) {
      console.error('ytmusic:getPlaylist error', err);
      return [];
    }
  });

  ipcMain.handle('ytmusic:getAlbum', async (_e, albumId: string) => {
    try {
      return await fetchInnerTubePlaylist(albumId, 50);
    } catch (err) {
      console.error('ytmusic:getAlbum error', err);
      return [];
    }
  });

  ipcMain.handle('ytmusic:getArtist', async (_e, artistId: string) => {
    try {
      return await fetchInnerTubePlaylist(artistId, 50);
    } catch (err) {
      console.error('ytmusic:getArtist error', err);
      return [];
    }
  });
}
