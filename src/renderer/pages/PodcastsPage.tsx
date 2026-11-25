import React, { useEffect, useState } from 'react';
import { Podcast, Search, Play, Plus, Check, ArrowLeft, Rss } from 'lucide-react';
import { usePlayer } from '../lib/usePlayer';
import { Track, usePlayerStore } from '../store';

interface PodcastShow {
  id: string;
  title: string;
  author: string;
  feedUrl: string;
  artwork?: string;
  description?: string;
}

interface PodcastEpisode {
  id: string;
  title: string;
  audioUrl: string;
  duration: number;
  pubDate?: string;
  description?: string;
  thumbnail?: string;
  showTitle: string;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PodcastsPage() {
  const { playTrack } = usePlayer();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PodcastShow[]>([]);
  const [subscriptions, setSubscriptions] = useState<PodcastShow[]>([]);
  const [activeShow, setActiveShow] = useState<PodcastShow | null>(null);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.podcasts
      ?.listSubscriptions()
      .then((subs) => setSubscriptions(subs || []))
      .catch(() => {});
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setErrorMsg(null);

    // Direct RSS feed URL shortcut
    if (/^https?:\/\//i.test(trimmed)) {
      await openFeed({
        id: trimmed,
        title: 'Loading Feed...',
        author: '',
        feedUrl: trimmed,
      });
      return;
    }

    setSearching(true);
    try {
      const list = await window.electronAPI?.podcasts?.search(trimmed);
      setResults(list || []);
      setActiveShow(null);
    } catch {
      setErrorMsg('Failed to search podcasts.');
    } finally {
      setSearching(false);
    }
  };

  const openFeed = async (show: PodcastShow) => {
    setErrorMsg(null);
    setActiveShow(show);
    setEpisodes([]);
    setLoadingFeed(true);
    try {
      const feed = await window.electronAPI?.podcasts?.getFeed(show.feedUrl);
      if (feed) {
        setActiveShow({ ...feed.show, artwork: feed.show.artwork || show.artwork });
        setEpisodes(feed.episodes || []);
      }
    } catch (err: any) {
      setErrorMsg(`Failed to load RSS feed: ${err?.message || 'network error'}`);
    } finally {
      setLoadingFeed(false);
    }
  };

  const isSubscribed = (feedUrl: string) => subscriptions.some((s) => s.feedUrl === feedUrl);

  const toggleSubscribe = async (show: PodcastShow) => {
    if (isSubscribed(show.feedUrl)) {
      const next = await window.electronAPI?.podcasts?.unsubscribe(show.feedUrl);
      if (next) setSubscriptions(next);
    } else {
      const next = await window.electronAPI?.podcasts?.subscribe(show);
      if (next) setSubscriptions(next);
    }
  };

  const toTrack = (ep: PodcastEpisode): Track => ({
    id: ep.id,
    title: ep.title,
    artist: ep.showTitle || activeShow?.title || 'Podcast',
    album: activeShow?.author || 'Podcast',
    thumbnail: ep.thumbnail || activeShow?.artwork,
    duration: ep.duration || 0,
    source: 'podcast',
    path: ep.audioUrl,
  });

  return (
    <div className="p-6 max-w-5xl space-y-6 pb-20">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2.5">
            <Podcast className="text-primary" size={26} />
            Podcasts &amp; RSS
          </h1>
          <p className="text-sm text-on-surface-variant">
            Discover podcasts via Apple Directory or paste any RSS feed URL
          </p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2.5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shows or paste RSS feed URL (https://...)"
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-surface-container text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {searching ? 'Searching...' : /^https?:\/\//i.test(query.trim()) ? 'Open RSS' : 'Search'}
        </button>
      </form>

      {errorMsg && (
        <div className="text-xs text-error bg-error/10 border border-error/20 px-4 py-2.5 rounded-xl">
          {errorMsg}
        </div>
      )}

      {activeShow ? (
        <div className="space-y-4">
          <button
            onClick={() => setActiveShow(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <ArrowLeft size={14} /> Back to Podcasts
          </button>

          <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/30 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            {activeShow.artwork ? (
              <img src={activeShow.artwork} alt={activeShow.title} className="w-24 h-24 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-24 h-24 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
                <Rss size={32} className="text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1.5">
              <h2 className="text-xl font-bold text-on-surface truncate">{activeShow.title}</h2>
              {activeShow.author && <p className="text-xs text-on-surface-variant">{activeShow.author}</p>}
              {activeShow.description && (
                <p className="text-xs text-on-surface-variant line-clamp-2">{activeShow.description}</p>
              )}
            </div>
            <button
              onClick={() => toggleSubscribe(activeShow)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 ${
                isSubscribed(activeShow.feedUrl)
                  ? 'bg-secondary-container text-on-surface'
                  : 'bg-primary text-on-primary'
              }`}
            >
              {isSubscribed(activeShow.feedUrl) ? (
                <>
                  <Check size={14} /> Subscribed
                </>
              ) : (
                <>
                  <Plus size={14} /> Subscribe
                </>
              )}
            </button>
          </div>

          {loadingFeed ? (
            <div className="text-sm text-on-surface-variant py-8 text-center">Loading episodes...</div>
          ) : episodes.length === 0 ? (
            <div className="text-sm text-on-surface-variant py-8 text-center">No audio episodes found in feed.</div>
          ) : (
            <div className="space-y-2">
              {episodes.map((ep, idx) => {
                const track = toTrack(ep);
                const queue = episodes.map(toTrack);
                return (
                  <div
                    key={ep.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 transition-colors"
                  >
                    <button
                      onClick={() => {
                        usePlayerStore.getState().setQueue(queue, idx);
                        playTrack(track);
                      }}
                      className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0 hover:opacity-90"
                      aria-label={`Play ${ep.title}`}
                    >
                      <Play size={15} fill="currentColor" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">{ep.title}</p>
                      <div className="flex items-center gap-3 text-xs text-on-surface-variant mt-0.5">
                        {ep.pubDate && <span>{ep.pubDate.slice(0, 16)}</span>}
                        {ep.duration > 0 && <span>{formatDuration(ep.duration)}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {results.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-on-surface uppercase tracking-wider">Search Results</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {results.map((show) => (
                  <button
                    key={show.id}
                    onClick={() => openFeed(show)}
                    className="text-left bg-surface-container hover:bg-surface-container-high p-3 rounded-2xl border border-outline-variant/20 transition-colors space-y-2"
                  >
                    {show.artwork ? (
                      <img src={show.artwork} alt={show.title} className="w-full aspect-square rounded-xl object-cover" />
                    ) : (
                      <div className="w-full aspect-square rounded-xl bg-surface-container-high flex items-center justify-center">
                        <Podcast size={28} className="text-primary" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-on-surface truncate">{show.title}</p>
                      <p className="text-[11px] text-on-surface-variant truncate">{show.author}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-on-surface uppercase tracking-wider">
              Subscriptions ({subscriptions.length})
            </h2>
            {subscriptions.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                No podcast subscriptions yet. Search above or paste an RSS feed URL to start listening.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {subscriptions.map((show) => (
                  <button
                    key={show.feedUrl}
                    onClick={() => openFeed(show)}
                    className="text-left bg-surface-container hover:bg-surface-container-high p-3 rounded-2xl border border-outline-variant/20 transition-colors space-y-2"
                  >
                    {show.artwork ? (
                      <img src={show.artwork} alt={show.title} className="w-full aspect-square rounded-xl object-cover" />
                    ) : (
                      <div className="w-full aspect-square rounded-xl bg-surface-container-high flex items-center justify-center">
                        <Podcast size={28} className="text-primary" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-on-surface truncate">{show.title}</p>
                      <p className="text-[11px] text-on-surface-variant truncate">{show.author}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
