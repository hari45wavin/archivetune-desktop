/**
 * podcasts.ts — Zero-dependency Podcast Search (iTunes API) & RSS Feed Parser
 */

import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import crypto from 'crypto';

export interface PodcastShow {
  id: string;
  title: string;
  author: string;
  feedUrl: string;
  artwork?: string;
  description?: string;
}

export interface PodcastEpisode {
  id: string;
  title: string;
  audioUrl: string;
  duration: number;
  pubDate?: string;
  description?: string;
  thumbnail?: string;
  showTitle: string;
}

function getSubsPath(): string {
  return path.join(app.getPath('userData'), 'podcasts-subs.json');
}

function loadSubscriptions(): PodcastShow[] {
  try {
    const file = getSubsPath();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore corrupt subscription store
  }
  return [];
}

function saveSubscriptions(shows: PodcastShow[]) {
  try {
    const file = getSubsPath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(shows, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to save podcasts-subs.json:', err);
  }
}

function fetchUrl(url: string, redirectsLeft = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      { headers: { 'User-Agent': 'ArchiveTuneDesktop/1.2' }, timeout: 12000 },
      (res) => {
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          fetchUrl(next, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if ((res.statusCode || 0) >= 400) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => {
          if (body.length < 4 * 1024 * 1024) body += chunk;
        });
        res.on('end', () => resolve(body));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

function decodeXmlText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function extractTag(block: string, tagName: string): string {
  const escaped = tagName.replace(':', '\\:');
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i');
  const match = block.match(re);
  return match ? decodeXmlText(match[1]) : '';
}

function extractAttr(block: string, tagName: string, attr: string): string {
  const escapedTag = tagName.replace(':', '\\:');
  const re = new RegExp(`<${escapedTag}[^>]*\\b${attr}=["']([^"']+)["']`, 'i');
  const match = block.match(re);
  return match ? match[1].trim() : '';
}

function parseDurationSeconds(raw: string): number {
  if (!raw) return 0;
  if (/^\d+$/.test(raw.trim())) return Number(raw.trim());
  const parts = raw.trim().split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function parseRssFeed(xml: string, feedUrl: string): { show: PodcastShow; episodes: PodcastEpisode[] } {
  const channelHeader = xml.split(/<item[\s>]/i)[0] || xml;
  const showTitle = extractTag(channelHeader, 'title') || 'Podcast';
  const showAuthor = extractTag(channelHeader, 'itunes:author') || 'Unknown Creator';
  const showDescription = extractTag(channelHeader, 'description') || extractTag(channelHeader, 'itunes:summary');
  const showArtwork =
    extractAttr(channelHeader, 'itunes:image', 'href') ||
    extractTag(channelHeader.match(/<image>([\s\S]*?)<\/image>/i)?.[1] || '', 'url') ||
    '';

  const show: PodcastShow = {
    id: crypto.createHash('sha1').update(feedUrl).digest('hex').slice(0, 12),
    title: showTitle,
    author: showAuthor,
    feedUrl,
    artwork: showArtwork,
    description: showDescription,
  };

  const episodes: PodcastEpisode[] = [];
  const itemRe = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && episodes.length < 50) {
    const item = m[1];
    const audioUrl = extractAttr(item, 'enclosure', 'url');
    if (!audioUrl) continue;
    const title = extractTag(item, 'title') || 'Untitled Episode';
    const epArtwork = extractAttr(item, 'itunes:image', 'href') || showArtwork;
    const pubDate = extractTag(item, 'pubDate');
    const description = extractTag(item, 'description') || extractTag(item, 'itunes:summary');
    const duration = parseDurationSeconds(extractTag(item, 'itunes:duration'));
    const id = `podcast:${crypto.createHash('sha1').update(audioUrl).digest('hex').slice(0, 16)}`;

    episodes.push({
      id,
      title,
      audioUrl,
      duration,
      pubDate,
      description,
      thumbnail: epArtwork,
      showTitle,
    });
  }

  return { show, episodes };
}

export function setupPodcastsIPC() {
  ipcMain.handle('podcasts:search', async (_e, query: string): Promise<PodcastShow[]> => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(trimmed)}&media=podcast&limit=20`;
    const body = await fetchUrl(url);
    const json = JSON.parse(body);
    const results = Array.isArray(json.results) ? json.results : [];
    return results
      .filter((r: any) => r.feedUrl)
      .map((r: any) => ({
        id: String(r.collectionId || r.trackId || r.feedUrl),
        title: String(r.collectionName || r.trackName || 'Podcast'),
        author: String(r.artistName || 'Unknown'),
        feedUrl: String(r.feedUrl),
        artwork: String(r.artworkUrl600 || r.artworkUrl100 || ''),
      }));
  });

  ipcMain.handle('podcasts:getFeed', async (_e, feedUrl: string) => {
    const xml = await fetchUrl(feedUrl);
    return parseRssFeed(xml, feedUrl);
  });

  ipcMain.handle('podcasts:listSubscriptions', () => loadSubscriptions());

  ipcMain.handle('podcasts:subscribe', (_e, show: PodcastShow) => {
    const subs = loadSubscriptions();
    if (!subs.some((s) => s.feedUrl === show.feedUrl)) {
      subs.unshift(show);
      saveSubscriptions(subs);
    }
    return subs;
  });

  ipcMain.handle('podcasts:unsubscribe', (_e, feedUrl: string) => {
    const subs = loadSubscriptions().filter((s) => s.feedUrl !== feedUrl);
    saveSubscriptions(subs);
    return subs;
  });
}
