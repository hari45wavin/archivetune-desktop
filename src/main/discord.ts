/**
 * discord.ts — Lightweight zero-dependency Discord Rich Presence over local IPC socket
 *
 * Implements Discord's local IPC frame protocol ([op:uint32LE][len:uint32LE][json])
 * across Windows Named Pipes and Linux/macOS UNIX sockets. Silently no-ops if
 * Discord desktop client is not running.
 */

import { ipcMain } from 'electron';
import net from 'net';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const DEFAULT_CLIENT_ID = '1165706613961789445';

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;

let socket: net.Socket | null = null;
let ready = false;
let connecting: Promise<boolean> | null = null;

function encodeFrame(op: number, payload: object): Buffer {
  const data = Buffer.from(JSON.stringify(payload), 'utf-8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(data.length, 4);
  return Buffer.concat([header, data]);
}

function getIpcPaths(): string[] {
  const paths: string[] = [];
  if (process.platform === 'win32') {
    for (let i = 0; i < 10; i++) {
      paths.push(`\\\\?\\pipe\\discord-ipc-${i}`);
    }
    return paths;
  }

  const runtimeDir = process.env.XDG_RUNTIME_DIR || os.tmpdir();
  const prefixes = [
    runtimeDir,
    path.join(runtimeDir, 'app', 'com.discordapp.Discord'),
    path.join(runtimeDir, 'snap.discord'),
    os.tmpdir(),
  ];
  for (const prefix of prefixes) {
    for (let i = 0; i < 4; i++) {
      const candidate = path.join(prefix, `discord-ipc-${i}`);
      if (fs.existsSync(candidate)) paths.push(candidate);
    }
  }
  return paths;
}

function connectCandidate(ipcPath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s = net.createConnection(ipcPath);
    const timer = setTimeout(() => {
      s.destroy();
      reject(new Error('Discord IPC timeout'));
    }, 1500);

    s.once('connect', () => {
      s.write(encodeFrame(OP_HANDSHAKE, { v: 1, client_id: DEFAULT_CLIENT_ID }));
    });

    s.once('data', () => {
      clearTimeout(timer);
      resolve(s);
    });

    s.once('error', (err) => {
      clearTimeout(timer);
      s.destroy();
      reject(err);
    });
  });
}

async function ensureConnected(): Promise<boolean> {
  if (socket && !socket.destroyed && ready) return true;
  if (connecting) return connecting;

  connecting = (async () => {
    for (const candidate of getIpcPaths()) {
      try {
        const s = await connectCandidate(candidate);
        socket = s;
        ready = true;
        s.on('close', () => {
          socket = null;
          ready = false;
        });
        s.on('error', () => {
          socket = null;
          ready = false;
        });
        return true;
      } catch {
        /* try next pipe */
      }
    }
    return false;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export interface DiscordActivityPayload {
  title: string;
  artist: string;
  album?: string;
  thumbnail?: string;
  duration?: number;
  position?: number;
}

export async function setDiscordActivity(track: DiscordActivityPayload | null): Promise<void> {
  const ok = await ensureConnected();
  if (!ok || !socket || socket.destroyed) return;

  let activity: Record<string, any> | null = null;
  if (track) {
    const nowSec = Math.floor(Date.now() / 1000);
    const posSec = Math.max(0, Math.floor(track.position || 0));
    const durSec = Math.max(0, Math.floor(track.duration || 0));

    activity = {
      type: 2, // Listening
      details: track.title.slice(0, 128),
      state: track.artist.slice(0, 128),
      assets: {
        large_image:
          track.thumbnail && track.thumbnail.startsWith('https://') ? track.thumbnail : undefined,
        large_text: (track.album || 'ArchiveTune Desktop').slice(0, 128),
      },
    };
    if (durSec > 0) {
      activity.timestamps = {
        start: nowSec - posSec,
        end: nowSec - posSec + durSec,
      };
    }
  }

  try {
    socket.write(
      encodeFrame(OP_FRAME, {
        cmd: 'SET_ACTIVITY',
        args: {
          pid: process.pid,
          activity,
        },
        nonce: crypto.randomUUID(),
      })
    );
  } catch {
    /* ignore broken pipe */
  }
}

export function cleanupDiscord() {
  if (socket) {
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
    socket = null;
    ready = false;
  }
}

export function setupDiscordIPC() {
  ipcMain.handle('discord:setActivity', async (_e, track: DiscordActivityPayload | null) => {
    await setDiscordActivity(track);
    return { ok: true };
  });
}
