import React, { useCallback, useMemo, useState } from 'react';
import {
  FolderOpen,
  RefreshCw,
  Music2,
  Heart,
  ListMusic,
  BarChart3,
  Plus,
  Trash2,
  Download,
  Upload,
  Play,
  ChevronLeft,
} from 'lucide-react';
import { useLibraryStore, usePlayerStore, Track, CustomPlaylist } from '../store';
import { usePlayer } from '../lib/usePlayer';
import TrackRow from '../components/TrackRow';

type LibraryTab = 'local' | 'favorites' | 'playlists' | 'stats';

function formatListeningDuration(totalSec: number): string {
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function LibraryPage() {
  const {
    tracks,
    directories,
    isScanning,
    favorites,
    customPlaylists,
    playStats,
    totalListeningSeconds,
    addDirectory,
    setTracks,
    setIsScanning,
    setCustomPlaylists,
  } = useLibraryStore();
  const { setQueue } = usePlayerStore();
  const { playTrack } = usePlayer();

  const [tab, setTab] = useState<LibraryTab>('local');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const selectedPlaylist: CustomPlaylist | null = useMemo(
    () => customPlaylists.find((p) => p.id === selectedPlaylistId) ?? null,
    [customPlaylists, selectedPlaylistId]
  );

  const topTracks = useMemo(
    () =>
      Object.values(playStats)
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 15),
    [playStats]
  );

  const topArtists = useMemo(() => {
    const counts = new Map<string, number>();
    for (const stat of Object.values(playStats)) {
      const artist = stat.track.artist || 'Unknown Artist';
      counts.set(artist, (counts.get(artist) || 0) + stat.playCount);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [playStats]);

  const scanDirectory = useCallback(
    async (dirPath: string) => {
      setIsScanning(true);
      try {
        const scanned = (await window.electronAPI?.library.scan(dirPath)) ?? [];
        const libTracks: Track[] = scanned.map((meta: any) => ({
          id: meta.path || meta.id,
          title: meta.title || 'Unknown Title',
          artist: meta.artist || 'Unknown Artist',
          album: meta.album,
          duration: meta.duration || 0,
          thumbnail: meta.thumbnail,
          source: 'local' as const,
          path: meta.path,
        }));
        setTracks([...useLibraryStore.getState().tracks, ...libTracks]);
      } finally {
        setIsScanning(false);
      }
    },
    [setTracks, setIsScanning]
  );

  const handleAddDirectory = useCallback(async () => {
    const dirPath = await window.electronAPI?.library.addDirectory();
    if (!dirPath) return;
    addDirectory(dirPath);
    await scanDirectory(dirPath);
  }, [addDirectory, scanDirectory]);

  const handleRescan = useCallback(async () => {
    setTracks([]);
    for (const dir of directories) {
      await scanDirectory(dir);
    }
  }, [directories, scanDirectory, setTracks]);

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const updated = await window.electronAPI?.storage?.createPlaylist(newPlaylistName.trim());
    if (updated) setCustomPlaylists(updated);
    setNewPlaylistName('');
  };

  const handleDeletePlaylist = async (id: string) => {
    const updated = await window.electronAPI?.storage?.deletePlaylist(id);
    if (updated) setCustomPlaylists(updated);
    if (selectedPlaylistId === id) setSelectedPlaylistId(null);
  };

  const handleExportM3U = async (id: string) => {
    const res = await window.electronAPI?.storage?.exportM3U(id);
    if (res?.ok) {
      setExportMsg(`Exported to ${res.path}`);
      setTimeout(() => setExportMsg(null), 4000);
    }
  };

  const handleImportM3U = async () => {
    const res = await window.electronAPI?.storage?.importM3U();
    if (res?.ok && res.playlists) {
      setCustomPlaylists(res.playlists);
      setExportMsg(`Imported playlist (${res.importedCount ?? 0} tracks)`);
      setTimeout(() => setExportMsg(null), 4000);
    }
  };

  return (
    <div className="p-6 space-y-6 pb-24">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Library</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Local music, favorites, playlists & listening stats
          </p>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-surface-container p-1 rounded-xl">
          {(
            [
              { id: 'local', label: `Local (${tracks.length})`, icon: Music2 },
              { id: 'favorites', label: `Favorites (${favorites.length})`, icon: Heart },
              { id: 'playlists', label: `Playlists (${customPlaylists.length})`, icon: ListMusic },
              { id: 'stats', label: 'Stats', icon: BarChart3 },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setSelectedPlaylistId(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === id
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 1: Local Files */}
      {tab === 'local' && (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            {directories.length > 0 && (
              <button
                onClick={handleRescan}
                disabled={isScanning}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors text-sm disabled:opacity-50"
              >
                <RefreshCw size={16} className={isScanning ? 'animate-spin' : ''} />
                Rescan
              </button>
            )}
            <button
              onClick={handleAddDirectory}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary hover:opacity-90 transition-opacity text-sm"
            >
              <FolderOpen size={16} />
              Add Folder
            </button>
          </div>

          {isScanning && (
            <div className="flex items-center gap-3 text-on-surface-variant bg-surface-container rounded-xl p-4">
              <RefreshCw size={16} className="animate-spin text-primary" />
              <span className="text-sm">Scanning library…</span>
            </div>
          )}

          {tracks.length > 0 ? (
            <div className="space-y-1">
              {tracks.map((track, i) => (
                <TrackRow key={track.id} track={track} index={i} showIndex queue={tracks} />
              ))}
            </div>
          ) : !isScanning ? (
            <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant gap-4">
              <Music2 size={48} className="text-primary/40" />
              <div className="text-center">
                <p className="text-base font-medium">Your local library is empty</p>
                <p className="text-sm mt-1">Add a folder containing your music files</p>
              </div>
              <button
                onClick={handleAddDirectory}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-on-primary hover:opacity-90 transition-opacity text-sm font-medium"
              >
                <FolderOpen size={18} />
                Choose Music Folder
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Tab 2: Favorites */}
      {tab === 'favorites' && (
        <div className="space-y-3">
          {favorites.length > 0 ? (
            <>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setQueue(favorites, 0);
                    playTrack(favorites[0]);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-semibold"
                >
                  <Play size={14} fill="currentColor" /> Play All
                </button>
              </div>
              <div className="space-y-1">
                {favorites.map((track, i) => (
                  <TrackRow key={`fav-${track.id}`} track={track} index={i} showIndex queue={favorites} />
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant gap-3">
              <Heart size={40} className="text-primary/40" />
              <p className="text-sm">No favorites yet — click the heart icon on any track!</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Custom Playlists */}
      {tab === 'playlists' && (
        <div className="space-y-4">
          {exportMsg && (
            <div className="px-4 py-2 rounded-xl bg-primary/15 text-primary text-xs font-medium">
              {exportMsg}
            </div>
          )}

          {selectedPlaylist ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSelectedPlaylistId(null)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  <ChevronLeft size={14} /> Back to Playlists
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExportM3U(selectedPlaylist.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container text-xs font-medium hover:bg-surface-container-high"
                  >
                    <Download size={13} /> Export M3U
                  </button>
                  {selectedPlaylist.tracks.length > 0 && (
                    <button
                      onClick={() => {
                        setQueue(selectedPlaylist.tracks, 0);
                        playTrack(selectedPlaylist.tracks[0]);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-semibold"
                    >
                      <Play size={13} fill="currentColor" /> Play All
                    </button>
                  )}
                </div>
              </div>

              <h2 className="text-xl font-bold text-on-surface">
                {selectedPlaylist.name} ({selectedPlaylist.tracks.length})
              </h2>

              {selectedPlaylist.tracks.length > 0 ? (
                <div className="space-y-1">
                  {selectedPlaylist.tracks.map((track, i) => (
                    <div key={`${selectedPlaylist.id}-${track.id}`} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <TrackRow track={track} index={i} showIndex queue={selectedPlaylist.tracks} />
                      </div>
                      <button
                        onClick={async () => {
                          const updated = await window.electronAPI?.storage?.removeTrackFromPlaylist(
                            selectedPlaylist.id,
                            track.id
                          );
                          if (updated) setCustomPlaylists(updated);
                        }}
                        className="p-2 text-on-surface-variant hover:text-error"
                        title="Remove from playlist"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant py-12 text-center">
                  Playlist is empty — use the + playlist icon on any track to add songs.
                </p>
              )}
            </div>
          ) : (
            <>
              <form onSubmit={handleCreatePlaylist} className="flex gap-2">
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="New playlist name…"
                  className="flex-1 px-4 py-2 rounded-xl bg-surface-container text-sm text-on-surface placeholder-on-surface-variant outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-semibold"
                >
                  <Plus size={14} /> Create
                </button>
                <button
                  type="button"
                  onClick={handleImportM3U}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface"
                >
                  <Upload size={14} /> Import M3U
                </button>
              </form>

              {customPlaylists.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {customPlaylists.map((pl) => (
                    <div
                      key={pl.id}
                      onClick={() => setSelectedPlaylistId(pl.id)}
                      className="p-4 rounded-2xl bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{pl.name}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">{pl.tracks.length} tracks</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePlaylist(pl.id);
                        }}
                        className="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-surface-container-highest"
                        title="Delete playlist"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant gap-2">
                  <ListMusic size={40} className="text-primary/40" />
                  <p className="text-sm">Create your first desktop playlist above</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab 4: Listening Stats */}
      {tab === 'stats' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-surface-container">
              <p className="text-xs text-on-surface-variant">Total Listening Time</p>
              <p className="text-2xl font-bold text-primary mt-1">{formatListeningDuration(totalListeningSeconds)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-surface-container">
              <p className="text-xs text-on-surface-variant">Unique Tracks Played</p>
              <p className="text-2xl font-bold text-on-surface mt-1">{Object.keys(playStats).length}</p>
            </div>
            <div className="p-4 rounded-2xl bg-surface-container">
              <p className="text-xs text-on-surface-variant">Total Plays</p>
              <p className="text-2xl font-bold text-on-surface mt-1">
                {Object.values(playStats).reduce((acc, s) => acc + s.playCount, 0)}
              </p>
            </div>
          </div>

          {topArtists.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">Top Artists</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {topArtists.map(([artist, count]) => (
                  <div key={artist} className="p-3 rounded-xl bg-surface-container">
                    <p className="text-xs font-semibold text-on-surface truncate">{artist}</p>
                    <p className="text-[11px] text-primary mt-0.5">{count} plays</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {topTracks.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">Most Played</h2>
              <div className="space-y-1">
                {topTracks.map((stat, i) => (
                  <div key={`stat-${stat.track.id}`} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <TrackRow
                        track={stat.track}
                        index={i}
                        showIndex
                        queue={topTracks.map((t) => t.track)}
                      />
                    </div>
                    <span className="text-xs font-semibold text-primary shrink-0 pr-2 tabular-nums">
                      {stat.playCount}x
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant gap-2">
              <BarChart3 size={40} className="text-primary/40" />
              <p className="text-sm">Play a few songs to see your listening stats</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
