/**
 * player.ts — Cross-platform mpv IPC audio player with native fallback
 *
 * - Uses UNIX Domain Sockets on Linux/macOS and Windows Named Pipes on win32
 * - Passes --ao=wasapi & windowsHide on Windows
 * - Falls back gracefully (returns { ok: false, fallback: true }) when mpv is
 *   not present so the renderer plays via Chromium's HTML5 Audio engine
 * - Uses runYtDlp (with net.fetch stream download fallback) for offline saves
 */

import { ipcMain, BrowserWindow, net } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import netSock from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveBinary, resolveSystemProxy } from './binaries';
import { runYtDlp, getStreamUrl } from './ytmusic';

const isWindows = process.platform === 'win32';
const SOCKET_PATH = isWindows
  ? `\\\\.\\pipe\\archivetune-mpv-${process.pid}`
  : path.join(os.tmpdir(), `archivetune-mpv-${process.pid}.sock`);

let mpvProcess: ChildProcess | null = null;
let mpvSocket: netSock.Socket | null = null;
let currentProgress = 0;
let currentDuration = 0;
let isPlaying = false;
let progressInterval: NodeJS.Timeout | null = null;
let socketBuffer = '';
let normEnabled = false;
let eqGains: number[] = [0, 0, 0, 0, 0];
const EQ_FREQS = [60, 230, 910, 3600, 14000];

async function applyMpvAudioFilters() {
  const filters: string[] = [];
  eqGains.forEach((gain, idx) => {
    if (Math.abs(gain) >= 0.5 && EQ_FREQS[idx]) {
      const clamped = Math.max(-12, Math.min(12, gain));
      filters.push(`equalizer=f=${EQ_FREQS[idx]}:t=q:w=1.2:g=${clamped}`);
    }
  });
  if (normEnabled) {
    filters.push('dynaudnorm=f=500:g=31:p=0.95:m=10.0:r=0.9');
  }
  if (filters.length > 0) {
    await sendMpvCommand({ command: ['af', 'set', `lavfi=[${filters.join(',')}]`] });
  } else {
    await sendMpvCommand({ command: ['af', 'clr', ''] });
  }
}

function cleanupSocketFile() {
  if (!isWindows && fs.existsSync(SOCKET_PATH)) {
    try {
      fs.unlinkSync(SOCKET_PATH);
    } catch {
      /* ignore */
    }
  }
}

function sendMpvCommand(command: object): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!mpvSocket || mpvSocket.destroyed) {
      reject(new Error('mpv socket not connected'));
      return;
    }
    const msg = JSON.stringify(command) + '\n';
    mpvSocket.write(msg, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function connectSocket(retries = 15): Promise<netSock.Socket> {
  return new Promise((resolve, reject) => {
    const tryConnect = (n: number) => {
      const socket = netSock.createConnection(SOCKET_PATH);
      socket.on('connect', () => resolve(socket));
      socket.on('error', () => {
        socket.destroy();
        if (n > 0) setTimeout(() => tryConnect(n - 1), 200);
        else reject(new Error('Could not connect to mpv IPC'));
      });
    };
    tryConnect(retries);
  });
}

function notifyProgress() {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('player:progress', {
      position: currentProgress,
      duration: currentDuration,
      isPlaying,
    });
  }
}

export function cleanupMpv() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  if (mpvSocket) {
    try {
      mpvSocket.destroy();
    } catch {
      /* ignore */
    }
    mpvSocket = null;
  }
  if (mpvProcess) {
    try {
      mpvProcess.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    mpvProcess = null;
  }
  cleanupSocketFile();
}

async function startMpv(): Promise<void> {
  const mpvBin = resolveBinary('mpv');
  if (!mpvBin) {
    throw new Error('mpv binary not found');
  }

  if (mpvProcess) {
    try {
      mpvProcess.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    mpvProcess = null;
  }
  cleanupSocketFile();

  const args = [
    '--idle=yes',
    '--no-video',
    '--no-terminal',
    `--input-ipc-server=${SOCKET_PATH}`,
    '--audio-display=no',
    '--gapless-audio=yes',
    '--demuxer-max-bytes=10M',
    '--demuxer-max-back-bytes=5M',
  ];
  if (isWindows) {
    args.push('--ao=wasapi');
  }

  const proxy = await resolveSystemProxy('https://www.youtube.com');
  const env = { ...process.env };
  if (proxy) {
    env.http_proxy = proxy;
    env.https_proxy = proxy;
    args.push(`--http-proxy=${proxy}`);
  }

  mpvProcess = spawn(mpvBin, args, { stdio: 'ignore', windowsHide: true, env });

  mpvProcess.on('error', () => {
    mpvProcess = null;
    mpvSocket = null;
    isPlaying = false;
  });

  mpvProcess.on('exit', () => {
    mpvProcess = null;
    mpvSocket = null;
    isPlaying = false;
  });

  mpvSocket = await connectSocket();

  await sendMpvCommand({ command: ['observe_property', 1, 'time-pos'] });
  await sendMpvCommand({ command: ['observe_property', 2, 'duration'] });
  await sendMpvCommand({ command: ['observe_property', 3, 'pause'] });

  socketBuffer = '';
  mpvSocket.on('data', (data: Buffer) => {
    socketBuffer += data.toString('utf-8');
    const lines = socketBuffer.split('\n');
    socketBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);

        if (msg.event === 'property-change') {
          if (msg.name === 'time-pos' && typeof msg.data === 'number') {
            currentProgress = msg.data;
            notifyProgress();
          } else if (msg.name === 'duration' && typeof msg.data === 'number') {
            currentDuration = msg.data;
            notifyProgress();
          } else if (msg.name === 'pause' && typeof msg.data === 'boolean') {
            isPlaying = !msg.data;
            notifyProgress();
          }
        }

        if (msg.request_id === 101 && typeof msg.data === 'number') {
          currentProgress = msg.data;
          notifyProgress();
        } else if (msg.request_id === 102 && typeof msg.data === 'number') {
          currentDuration = msg.data;
          notifyProgress();
        }

        if (msg.event === 'end-file' && msg.reason !== 'stop' && msg.reason !== 'redirect') {
          isPlaying = false;
          const win = BrowserWindow.getAllWindows()[0];
          win?.webContents.send('player:ended');
        }
        if (msg.event === 'playback-restart') {
          isPlaying = true;
          notifyProgress();
        }
      } catch {
        /* ignore incomplete JSON lines */
      }
    }
  });
}

function startProgressPolling() {
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(async () => {
    if (!isPlaying || !mpvSocket || mpvSocket.destroyed) return;
    try {
      await sendMpvCommand({ command: ['get_property', 'time-pos'], request_id: 101 });
      if (currentDuration <= 0) {
        await sendMpvCommand({ command: ['get_property', 'duration'], request_id: 102 });
      }
    } catch {
      /* ignore */
    }
  }, 250);
}

export function setupPlayerIPC() {
  ipcMain.handle('player:play', async (_e, url: string, _meta: object) => {
    try {
      if (!mpvProcess || !mpvSocket || mpvSocket.destroyed) {
        await startMpv();
      }
      await sendMpvCommand({ command: ['loadfile', url, 'replace'] });
      isPlaying = true;
      currentProgress = 0;
      startProgressPolling();
      return { ok: true, mode: 'mpv' };
    } catch (err: any) {
      return { ok: false, fallback: true, error: err?.message || 'mpv unavailable' };
    }
  });

  ipcMain.handle('player:pause', async () => {
    try {
      await sendMpvCommand({ command: ['set_property', 'pause', true] });
      isPlaying = false;
      notifyProgress();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('player:resume', async () => {
    try {
      await sendMpvCommand({ command: ['set_property', 'pause', false] });
      isPlaying = true;
      notifyProgress();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('player:stop', async () => {
    try {
      await sendMpvCommand({ command: ['stop'] });
      isPlaying = false;
      currentProgress = 0;
      notifyProgress();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('player:seek', async (_e, seconds: number) => {
    try {
      await sendMpvCommand({ command: ['seek', seconds, 'absolute'] });
      currentProgress = seconds;
      notifyProgress();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('player:setVolume', async (_e, vol: number) => {
    try {
      await sendMpvCommand({ command: ['set_property', 'volume', Math.round(vol * 100)] });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('player:setSpeed', async (_e, speed: number) => {
    try {
      await sendMpvCommand({ command: ['set_property', 'speed', speed] });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('player:setNormalization', async (_e, enabled: boolean) => {
    normEnabled = !!enabled;
    try {
      await applyMpvAudioFilters();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('player:setEqualizer', async (_e, gains: number[]) => {
    if (Array.isArray(gains) && gains.length === 5) {
      eqGains = gains.map((g) => (Number.isFinite(g) ? Math.max(-12, Math.min(12, g)) : 0));
    }
    try {
      await applyMpvAudioFilters();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('player:getStatus', () => ({
    isPlaying,
    position: currentProgress,
    duration: currentDuration,
  }));

  ipcMain.handle('player:downloadTrack', async (_e, track: { title: string; artist: string; id: string }) => {
    try {
      const musicDir = path.join(os.homedir(), 'Music');
      if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });

      const safeTitle = `${track.artist} - ${track.title}`.replace(/[\\/:*?"<>|]/g, '_');
      const targetUrl = track.id.startsWith('http')
        ? track.id
        : `https://www.youtube.com/watch?v=${track.id}`;

      if (resolveBinary('yt-dlp')) {
        const outPath = path.join(musicDir, `${safeTitle}.%(ext)s`);
        await runYtDlp(
          [
            '-x',
            '--audio-format',
            'mp3',
            '--audio-quality',
            '0',
            '--embed-thumbnail',
            '--add-metadata',
            '-o',
            outPath,
            '--no-playlist',
            targetUrl,
          ],
          120000
        );
        return { ok: true, path: musicDir };
      }

      // Pure Electron fallback when yt-dlp isn't present: download stream directly
      const streamUrl = await getStreamUrl(track.id);
      const res = await net.fetch(streamUrl);
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      const contentType = res.headers.get('content-type') || '';
      const ext = contentType.includes('webm') ? 'webm' : 'm4a';
      const arrayBuf = await res.arrayBuffer();
      fs.writeFileSync(path.join(musicDir, `${safeTitle}.${ext}`), Buffer.from(arrayBuf));
      return { ok: true, path: musicDir };
    } catch (err: any) {
      console.error('Download error', err);
      return { ok: false, error: err.message || String(err) };
    }
  });
}
