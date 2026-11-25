import React, { useState, useCallback } from 'react';
import { Search, Disc3, User, ListMusic, Music2, ChevronLeft, Play } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import TrackRow from '../components/TrackRow';
import { Track, usePlayerStore } from '../store';
import { usePlayer } from '../lib/usePlayer';

type SearchTab = 'songs' | 'album' | 'artist' | 'playlist';

interface CollectionItem {
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string;
  kind: 'album' | 'artist' | 'playlist';
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [tab, setTab] = useState<SearchTab>('songs');
  const [selectedCollection, setSelectedCollection] = useState<CollectionItem | null>(null);

  const { setQueue } = usePlayerStore();
  const { playTrack } = usePlayer();

  const { data: songResults = [], isLoading: songsLoading, isFetching: songsFetching } = useQuery<Track[]>({
    queryKey: ['search', submitted],
    queryFn: async () => {
      if (!submitted) return [];
      const res = await window.electronAPI?.ytmusic.search(submitted);
      return (res || []).map((t: any) => ({ ...t, source: 'youtube' as const }));
    },
    enabled: submitted.length > 0 && tab === 'songs' && !selectedCollection,
  });

  const {
    data: collectionResults = [],
    isLoading: collectionsLoading,
    isFetching: collectionsFetching,
  } = useQuery<CollectionItem[]>({
    queryKey: ['searchCollections', submitted, tab],
    queryFn: async () => {
      if (!submitted || tab === 'songs') return [];
      return (await window.electronAPI?.ytmusic.searchCollections(submitted, tab)) || [];
    },
    enabled: submitted.length > 0 && tab !== 'songs' && !selectedCollection,
  });

  const { data: collectionTracks = [], isLoading: detailLoading } = useQuery<Track[]>({
    queryKey: ['collectionDetail', selectedCollection?.kind, selectedCollection?.id],
    queryFn: async () => {
      if (!selectedCollection) return [];
      const api = window.electronAPI?.ytmusic;
      if (!api) return [];
      const res =
        selectedCollection.kind === 'album'
          ? await api.getAlbum(selectedCollection.id)
          : selectedCollection.kind === 'artist'
          ? await api.getArtist(selectedCollection.id)
          : await api.getPlaylist(selectedCollection.id);
      return (res || []).map((t: any) => ({
        ...t,
        album: t.album || (selectedCollection.kind === 'album' ? selectedCollection.title : undefined),
        source: 'youtube' as const,
      }));
    },
    enabled: !!selectedCollection,
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setSelectedCollection(null);
      setSubmitted(query.trim());
    },
    [query]
  );

  if (selectedCollection) {
    return (
      <div className="p-6 space-y-6 pb-24">
        <button
          onClick={() => setSelectedCollection(null)}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <ChevronLeft size={14} /> Back to Search
        </button>

        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-2xl overflow-hidden bg-surface-container-high shrink-0 shadow-md">
            {selectedCollection.thumbnail ? (
              <img src={selectedCollection.thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl">🎵</div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-primary">
              {selectedCollection.kind}
            </span>
            <h1 className="text-2xl font-bold text-on-surface truncate">{selectedCollection.title}</h1>
            <p className="text-xs text-on-surface-variant truncate">{selectedCollection.subtitle}</p>
            {collectionTracks.length > 0 && (
              <button
                onClick={() => {
                  setQueue(collectionTracks, 0);
                  playTrack(collectionTracks[0]);
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-semibold"
              >
                <Play size={13} fill="currentColor" /> Play All ({collectionTracks.length})
              </button>
            )}
          </div>
        </div>

        {detailLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-xl" />
            ))}
          </div>
        ) : collectionTracks.length > 0 ? (
          <div className="space-y-1">
            {collectionTracks.map((track, i) => (
              <TrackRow key={`${track.id}-${i}`} track={track} index={i} showIndex queue={collectionTracks} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-12 text-center">No tracks found in this collection.</p>
        )}
      </div>
    );
  }

  const isBusy = tab === 'songs' ? songsLoading || songsFetching : collectionsLoading || collectionsFetching;

  return (
    <div className="p-6 space-y-5 pb-24">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-on-surface">Search</h1>
        <div className="flex items-center gap-1.5 bg-surface-container p-1 rounded-xl">
          {(
            [
              { id: 'songs', label: 'Songs', icon: Music2 },
              { id: 'album', label: 'Albums', icon: Disc3 },
              { id: 'artist', label: 'Artists', icon: User },
              { id: 'playlist', label: 'Playlists', icon: ListMusic },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
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

      {/* Search bar */}
      <form onSubmit={handleSubmit} className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Songs, artists, albums, playlists…"
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-container text-on-surface placeholder-on-surface-variant outline-none focus:ring-2 focus:ring-primary transition-shadow text-sm"
          autoFocus
        />
      </form>

      {/* Results */}
      {isBusy ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <div className="skeleton w-10 h-10 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 rounded w-2/3" />
                <div className="skeleton h-3 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : tab === 'songs' && songResults.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs text-on-surface-variant mb-3">
            {songResults.length} songs for &quot;{submitted}&quot;
          </p>
          {songResults.map((track, i) => (
            <TrackRow key={track.id} track={track} index={i} queue={songResults} />
          ))}
        </div>
      ) : tab !== 'songs' && collectionResults.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {collectionResults.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedCollection(item)}
              className="group p-3 rounded-2xl bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer flex flex-col gap-2.5 shadow-sm"
            >
              <div
                className={`aspect-square overflow-hidden bg-surface-container-highest ${
                  item.kind === 'artist' ? 'rounded-full' : 'rounded-xl'
                }`}
              >
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl">🎵</div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate">{item.title}</p>
                <p className="text-xs text-on-surface-variant truncate mt-0.5">{item.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      ) : submitted ? (
        <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
          <span className="text-5xl mb-4">🔍</span>
          <p className="text-base">No results for &quot;{submitted}&quot;</p>
          <p className="text-sm mt-1">Try different keywords or another tab</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
          <span className="text-5xl mb-4">🎵</span>
          <p className="text-base">Search YouTube Music</p>
          <p className="text-sm mt-1">Find songs, albums, artists, and playlists</p>
        </div>
      )}
    </div>
  );
}
