/**
 * sponsorblock.ts — Auto-skip non-music segments (intro/outro/sponsor/offtopic) on YouTube tracks
 */

import { ipcMain, net } from 'electron';

export interface SkipSegment {
  start: number;
  end: number;
  category: string;
}

const segmentCache = new Map<string, SkipSegment[]>();
const CATEGORIES = encodeURIComponent(
  JSON.stringify(['sponsor', 'intro', 'outro', 'selfpromo', 'interaction', 'music_offtopic'])
);

export async function fetchSponsorBlockSegments(videoId: string): Promise<SkipSegment[]> {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return [];
  if (segmentCache.has(videoId)) return segmentCache.get(videoId)!;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await net.fetch(
      `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=${CATEGORIES}`,
      { signal: controller.signal }
    );
    if (!res.ok) {
      segmentCache.set(videoId, []);
      return [];
    }
    const raw = await res.json();
    const segments: SkipSegment[] = Array.isArray(raw)
      ? raw
          .map((item: any) => ({
            start: Number(item?.segment?.[0]),
            end: Number(item?.segment?.[1]),
            category: String(item?.category || 'sponsor'),
          }))
          .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
      : [];
    segmentCache.set(videoId, segments);
    return segments;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function setupSponsorBlockIPC() {
  ipcMain.handle('sponsorblock:getSegments', async (_e, videoId: string) => {
    return fetchSponsorBlockSegments(videoId);
  });
}
