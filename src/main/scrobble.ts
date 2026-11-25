/**
 * scrobble.ts — Last.fm Audioscrobbler 2.0 & ListenBrainz scrobbling
 */

import { ipcMain, net } from 'electron';
import crypto from 'crypto';
import querystring from 'querystring';

interface ScrobbleConfig {
  apiKey: string;
  apiSecret: string;
  sessionKey: string;
}

interface TrackInput {
  artist: string;
  title?: string;
  track?: string;
  album?: string;
  timestamp?: number;
  duration?: number;
}

let config: ScrobbleConfig | null = null;
let listenBrainzToken: string | null = null;

function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

function sign(params: Record<string, string>, secret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  return md5(sorted + secret);
}

async function postLastfm(params: Record<string, string>): Promise<object> {
  const body = querystring.stringify(params);
  const res = await net.fetch('https://ws.audioscrobbler.com/2.0/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ArchiveTune-Desktop/1.1 (https://github.com/hari45wavin/archivetune-desktop)',
    },
    body,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function submitListenBrainz(listenType: 'playing_now' | 'single', track: TrackInput): Promise<void> {
  if (!listenBrainzToken) return;
  const trackName = track.title || track.track || '';
  if (!trackName || !track.artist) return;

  const trackMetadata: Record<string, any> = {
    artist_name: track.artist,
    track_name: trackName,
  };
  if (track.album) trackMetadata.release_name = track.album;
  if (track.duration && track.duration > 0) {
    trackMetadata.additional_info = { duration: Math.round(track.duration) };
  }

  const payloadEntry: Record<string, any> = { track_metadata: trackMetadata };
  if (listenType === 'single') {
    payloadEntry.listened_at = track.timestamp || Math.floor(Date.now() / 1000);
  }

  const res = await net.fetch('https://api.listenbrainz.org/1/submit-listens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${listenBrainzToken}`,
      'User-Agent': 'ArchiveTune-Desktop/1.1 (https://github.com/hari45wavin/archivetune-desktop)',
    },
    body: JSON.stringify({
      listen_type: listenType,
      payload: [payloadEntry],
    }),
  });
  if (!res.ok) {
    throw new Error(`ListenBrainz HTTP ${res.status}`);
  }
}

export function setupScrobbleIPC() {
  ipcMain.handle('scrobble:configure', (_e, apiKey: string, apiSecret: string, sessionKey: string) => {
    config = apiKey && apiSecret && sessionKey ? { apiKey, apiSecret, sessionKey } : null;
    return { ok: true };
  });

  ipcMain.handle('scrobble:configureListenBrainz', (_e, token: string) => {
    const trimmed = String(token || '').trim();
    listenBrainzToken = trimmed || null;
    return { ok: true };
  });

  ipcMain.handle('scrobble:nowPlaying', async (_e, track: TrackInput) => {
    const trackName = track.title || track.track || '';
    if (!config && !listenBrainzToken) return { ok: false, error: 'not configured' };

    const tasks: Promise<any>[] = [];
    if (config && trackName) {
      const params: Record<string, string> = {
        method: 'track.updateNowPlaying',
        artist: track.artist,
        track: trackName,
        api_key: config.apiKey,
        sk: config.sessionKey,
        format: 'json',
      };
      if (track.album) params.album = track.album;
      if (track.duration) params.duration = String(Math.round(track.duration));
      params.api_sig = sign(params, config.apiSecret);
      tasks.push(postLastfm(params));
    }
    if (listenBrainzToken) {
      tasks.push(submitListenBrainz('playing_now', track));
    }

    try {
      await Promise.all(tasks);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('scrobble:scrobble', async (_e, track: TrackInput) => {
    const trackName = track.title || track.track || '';
    if (!config && !listenBrainzToken) return { ok: false, error: 'not configured' };

    const tasks: Promise<any>[] = [];
    if (config && trackName) {
      const params: Record<string, string> = {
        method: 'track.scrobble',
        artist: track.artist,
        track: trackName,
        timestamp: String(track.timestamp || Math.floor(Date.now() / 1000)),
        api_key: config.apiKey,
        sk: config.sessionKey,
        format: 'json',
      };
      if (track.album) params.album = track.album;
      if (track.duration) params.duration = String(Math.round(track.duration));
      params.api_sig = sign(params, config.apiSecret);
      tasks.push(postLastfm(params));
    }
    if (listenBrainzToken) {
      tasks.push(submitListenBrainz('single', track));
    }

    try {
      await Promise.all(tasks);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}
