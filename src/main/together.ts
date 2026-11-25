/**
 * together.ts — Zero-dependency LAN Together Mode WebSocket host (RFC 6455)
 *
 * Allows a desktop user to host a synchronized listening room over LAN/VPN
 * and broadcast current track, play/pause state, and playback position to guests.
 */

import { ipcMain } from 'electron';
import http from 'http';
import crypto from 'crypto';
import net from 'net';
import os from 'os';

export interface TogetherPlaybackState {
  track: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    thumbnail?: string;
    duration: number;
    source: 'youtube' | 'local' | 'spotify' | 'podcast';
  } | null;
  isPlaying: boolean;
  position: number;
  updatedAt: number;
}

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

let server: http.Server | null = null;
const clients = new Set<net.Socket>();
let lastState: TogetherPlaybackState = {
  track: null,
  isPlaying: false,
  position: 0,
  updatedAt: Date.now(),
};

function encodeWsFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf-8');
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function broadcastState(state: TogetherPlaybackState) {
  lastState = state;
  const frame = encodeWsFrame(JSON.stringify({ type: 'state', ...state }));
  for (const sock of clients) {
    if (!sock.destroyed) {
      try {
        sock.write(frame);
      } catch {
        clients.delete(sock);
      }
    }
  }
}

function getLocalIPv4(): string {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const info of list || []) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address;
      }
    }
  }
  return '127.0.0.1';
}

export function stopTogetherServer() {
  for (const sock of clients) {
    try {
      sock.destroy();
    } catch { /* ignore */ }
  }
  clients.clear();
  if (server) {
    try {
      server.close();
    } catch { /* ignore */ }
    server = null;
  }
}

export function setupTogetherIPC() {
  ipcMain.handle('together:startHost', (_e, port = 47820) => {
    stopTogetherServer();
    return new Promise((resolve) => {
      const srv = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ArchiveTune Together Host');
      });

      srv.on('upgrade', (req, socket: net.Socket) => {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
          socket.destroy();
          return;
        }
        const accept = crypto
          .createHash('sha1')
          .update(key + WS_MAGIC)
          .digest('base64');

        socket.write(
          [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`,
            '',
            '',
          ].join('\r\n')
        );

        clients.add(socket);
        if (lastState.track) {
          try {
            socket.write(encodeWsFrame(JSON.stringify({ type: 'state', ...lastState })));
          } catch { /* ignore */ }
        }

        const cleanup = () => clients.delete(socket);
        socket.on('close', cleanup);
        socket.on('error', cleanup);
      });

      srv.on('error', (err) => {
        resolve({ ok: false, error: err.message });
      });

      srv.listen(port, '0.0.0.0', () => {
        server = srv;
        const addr = srv.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : port;
        resolve({
          ok: true,
          url: `ws://${getLocalIPv4()}:${actualPort}`,
          clients: clients.size,
        });
      });
    });
  });

  ipcMain.handle('together:stopHost', () => {
    stopTogetherServer();
    return { ok: true };
  });

  ipcMain.handle('together:broadcast', (_e, state: TogetherPlaybackState) => {
    if (server) {
      broadcastState(state);
    }
    return { ok: true, clients: clients.size };
  });

  ipcMain.handle('together:getHostStatus', () => ({
    hosting: Boolean(server),
    clients: clients.size,
  }));
}
