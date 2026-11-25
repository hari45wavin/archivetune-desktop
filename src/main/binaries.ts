import { app, session } from 'electron';
import fs from 'fs';
import path from 'path';

const binaryCache = new Map<string, string | null>();

function getExecutableName(name: string): string {
  return process.platform === 'win32' && !name.endsWith('.exe') ? `${name}.exe` : name;
}

/**
 * Resolves an external CLI binary (yt-dlp, mpv, ffmpeg) from bundled resources,
 * userData/bin, or common system PATH locations. Returns null if not found on disk
 * (except callers may optionally check PATH via findBinaryInPath).
 */
export function resolveBinary(name: 'yt-dlp' | 'mpv' | 'ffmpeg'): string | null {
  if (binaryCache.has(name)) {
    return binaryCache.get(name) ?? null;
  }

  const exe = getExecutableName(name);
  const candidates: string[] = [];

  try {
    if (process.resourcesPath) {
      candidates.push(path.join(process.resourcesPath, 'bin', exe));
      candidates.push(path.join(process.resourcesPath, 'bin', process.platform, exe));
    }
  } catch { /* ignore */ }

  try {
    const appPath = app.getAppPath();
    candidates.push(path.join(appPath, 'resources', 'bin', process.platform, exe));
    candidates.push(path.join(appPath, '..', 'resources', 'bin', process.platform, exe));
  } catch { /* ignore */ }

  try {
    candidates.push(path.join(app.getPath('userData'), 'bin', exe));
  } catch { /* ignore */ }

  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    candidates.push(path.join(dir, exe));
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        binaryCache.set(name, candidate);
        return candidate;
      }
    } catch { /* ignore */ }
  }

  binaryCache.set(name, null);
  return null;
}

/**
 * Resolves the active Chromium/Windows system/VPN proxy for a target URL,
 * returning an HTTP/SOCKS URL suitable for CLI flags like yt-dlp --proxy.
 */
export async function resolveSystemProxy(targetUrl = 'https://www.youtube.com'): Promise<string | null> {
  try {
    const proxyString = await session.defaultSession.resolveProxy(targetUrl);
    if (!proxyString || proxyString === 'DIRECT') return null;

    const first = proxyString.split(';')[0]?.trim() || '';
    if (first.startsWith('PROXY ')) {
      const hostPort = first.slice(6).trim();
      return hostPort.includes('://') ? hostPort : `http://${hostPort}`;
    }
    if (first.startsWith('HTTPS ')) {
      return `https://${first.slice(6).trim()}`;
    }
    if (first.startsWith('SOCKS5 ') || first.startsWith('SOCKS ')) {
      const hostPort = first.replace(/^SOCKS5?\s+/, '').trim();
      return `socks5://${hostPort}`;
    }
  } catch { /* ignore */ }
  return null;
}
