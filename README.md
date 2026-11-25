# 🌸 ArchiveTune Desktop

> **The Cutest Music Player With Support for Local Files, Spotify Sync & YouTube Music — Now on Windows & Linux!**

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-blue.svg)]()
[![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg)](https://www.typescriptlang.org/)

---

## 🌟 Overview

ArchiveTune is widely loved on Android for its **Material You / Material 3** design, synced lyrics, Spotify integration, and seamless combination of local music libraries with YouTube Music streaming.

**ArchiveTune Desktop** brings the native desktop experience to **Windows** and **Linux**, built with **Electron + React + TypeScript + Tailwind CSS**, using Chromium's native network stack (InnerTube API) + **`mpv`** (with automatic built-in HTML5 Audio fallback on Windows) and bundled **`yt-dlp`**.

This repository addresses upstream ArchiveTune requests:
* **[#584: Linux version (flatpak/appimage)](https://github.com/rukamori/ArchiveTune/issues/584)**
* **[#900: Desktop/Web App - Archive Tune](https://github.com/rukamori/ArchiveTune/issues/900)**
* **[#1360: PC version of the app](https://github.com/rukamori/ArchiveTune/issues/1360)**

---

## 📦 Download (Windows & Linux)

Grab the latest pre-built binaries from the [**Releases Page**](https://github.com/hari45wavin/archivetune-desktop/releases):

* **Windows 10 / 11:**
  * **Portable (`.exe`)**: Single executable — no installation needed.
  * **Installer (`Setup.exe`)**: Standard NSIS setup installer with Start Menu shortcuts.
* **Linux (x64):**
  * **AppImage**: `chmod +x ArchiveTune-*.AppImage && ./ArchiveTune-*.AppImage`
  * **Tarball (`.tar.gz`)**: Extract and run directly.

---

## ✨ Features

| Feature | Description |
|---|---|
| **🎨 Material You Dynamic Theming** | Full M3 dark, light, and AMOLED pure black themes with customizable seed accent color palettes. |
| **🎵 YouTube Music Streaming** | Instant charts, search, and streaming via native InnerTube (`net.fetch`, VPN/proxy-aware) + `yt-dlp` fallback. |
| **💚 Spotify Connect Integration** | Import & play Spotify Liked Songs and all Playlists (with full pagination) resolved to high-fidelity audio streams. |
| **📁 Local Music Library** | Fast local directory scanning for MP3, FLAC, WAV, OGG, M4A, OPUS with ID3/tag parsing. |
| **🎤 Synced Waterfall Lyrics** | Synchronized line-by-line LRC lyrics with auto-scrolling, click-to-seek, sync offset slider (-5s to +5s), and font size toggles. |
| **⏰ Sleep Timer** | Configurable sleep timer (15m, 30m, 45m, 60m, or end-of-track) with live badge display. |
| **⚡ Playback Speed & Normalization** | 0.5x to 2.0x playback speed and Dynamic Audio Normalization (`dynaudnorm`) with `mpv`. |
| **💾 Offline Downloader** | One-click track download to your `Music` folder. |
| **📻 Last.fm Scrobbler** | Audioscrobbler 2.0 integration with live Now Playing updates and scrobbling thresholds. |
| **🎛️ Dual Audio Backend** | Native `mpv` IPC engine (UNIX sockets on Linux, Named Pipes + WASAPI on Windows) with automatic built-in HTML5 Audio fallback when `mpv` is absent. |

---

## 🚀 Development Setup

### 1. Prerequisites

On **Linux**, install `mpv` and `yt-dlp` for full `mpv` IPC audio and MP3 downloads:
```bash
# Arch Linux / Omarchy
sudo pacman -S mpv yt-dlp nodejs npm

# Ubuntu / Debian
sudo apt update && sudo apt install -y mpv yt-dlp nodejs npm

# Fedora
sudo dnf install -y mpv yt-dlp nodejs npm
```

On **Windows**, Node.js 20+ is all that's needed for development (`yt-dlp.exe` is bundled in CI releases and built-in HTML5 Audio plays streams even without `mpv.exe`).

### 2. Run Locally

```bash
git clone https://github.com/hari45wavin/archivetune-desktop.git
cd archivetune-desktop
npm install
npm run dev
```

### 3. Build & Package

```bash
npm run typecheck
npm run dist:linux   # Linux AppImage / dir
npm run dist:win     # Windows NSIS / portable (on Windows or Wine)
```

---

## 🛠️ Architecture

```
archivetune-desktop/
├── src/
│   ├── main/                  # Electron Main Process (Node.js)
│   │   ├── index.ts           # Window lifecycle, memory tuning, IPC registration
│   │   ├── binaries.ts        # Cross-platform binary & system/VPN proxy resolver
│   │   ├── player.ts          # mpv IPC engine (UNIX sockets / Windows Named Pipes)
│   │   ├── ytmusic.ts         # InnerTube API (net.fetch) + yt-dlp fallback
│   │   ├── spotify.ts         # Spotify Web OAuth, full pagination & stream resolver
│   │   ├── library.ts         # Local music directory recursive scanner
│   │   ├── lyrics.ts          # LRCLib synced lyrics fetcher & LRC parser
│   │   └── preload.ts         # Secure contextBridge API for renderer
│   │
│   └── renderer/              # Electron Renderer Process (React + Vite)
│       ├── components/        # TitleBar, Sidebar, MiniPlayer, NowPlayingOverlay, TrackRow
│       ├── pages/             # HomePage, SearchPage, SpotifyPage, LibraryPage, SettingsPage
│       ├── store/             # Zustand player, UI, and library stores
│       ├── lib/               # usePlayer hook (mpv + HTML5 Audio fallback)
│       └── styles/            # globals.css with Material You CSS variables
│
├── .github/workflows/         # Automated Linux + Windows CI/CD build matrix
├── assets/                    # App icons & branding resources
├── package.json               # Scripts & electron-builder config
└── tsconfig.json              # TypeScript configuration
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

## 💖 Acknowledgments

* [rukamori/ArchiveTune](https://github.com/rukamori/ArchiveTune) for the original Android design and inspiration.
* [mpv](https://mpv.io/) and [yt-dlp](https://github.com/yt-dlp/yt-dlp) for audio playback and media resolution.
