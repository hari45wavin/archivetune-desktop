import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertCircle, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import TitleBar from './components/TitleBar';
import MiniPlayer from './components/MiniPlayer';
import NowPlayingOverlay from './components/NowPlayingOverlay';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import SpotifyPage from './pages/SpotifyPage';
import LibraryPage from './pages/LibraryPage';
import SettingsPage from './pages/SettingsPage';
import { useUIStore, usePlayerStore } from './store';
import { usePlayer, usePlayerEvents } from './lib/usePlayer';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, gcTime: 5 * 60 * 1000, retry: 1 },
  },
});

function AppContent() {
  usePlayerEvents();
  const { showNowPlaying } = useUIStore();
  const { currentTrack } = usePlayer();
  const playbackError = usePlayerStore((s) => s.playbackError);
  const setPlaybackError = usePlayerStore((s) => s.setPlaybackError);

  useEffect(() => {
    if (!playbackError) return;
    const timer = setTimeout(() => setPlaybackError(null), 6000);
    return () => clearTimeout(timer);
  }, [playbackError, setPlaybackError]);

  return (
    <div className="flex flex-col h-full bg-surface text-on-surface overflow-hidden select-none">
      {/* Custom Titlebar */}
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/spotify" element={<SpotifyPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {/* Mini Player (bottom bar) */}
      {currentTrack && <MiniPlayer />}

      {/* Playback Error Toast */}
      {playbackError && (
        <div className="fixed bottom-24 right-5 z-50 max-w-sm flex items-start gap-2.5 px-4 py-3 rounded-xl bg-error-container text-on-error-container shadow-xl border border-error/20 text-xs">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-error" />
          <span className="flex-1 leading-relaxed break-words">{playbackError}</span>
          <button
            onClick={() => setPlaybackError(null)}
            className="shrink-0 opacity-70 hover:opacity-100"
            aria-label="Dismiss error"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Full Now Playing Overlay */}
      {showNowPlaying && <NowPlayingOverlay />}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AppContent />
      </HashRouter>
    </QueryClientProvider>
  );
}
