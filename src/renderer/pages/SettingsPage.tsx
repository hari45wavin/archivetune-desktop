import React, { useEffect, useState } from 'react';
import {
  Palette,
  Radio,
  Disc3,
  Info,
  ExternalLink,
  ListMusic,
  Sliders,
  Sparkles,
  FolderDown,
  Clock,
  Languages,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUIStore, usePlayerStore, useTogetherStore, EQ_BAND_LABELS, EQ_PRESETS } from '../store';
import { usePlayer } from '../lib/usePlayer';

const SEED_COLORS = [
  { name: 'Lavender', hex: '#cbb9f5' },
  { name: 'Sakura Pink', hex: '#f0b8c6' },
  { name: 'Ocean Cyan', hex: '#a6e3e9' },
  { name: 'Mint Green', hex: '#a8e6cf' },
  { name: 'Amber Gold', hex: '#ffd3b6' },
  { name: 'Ruby Red', hex: '#ffaaa5' },
  { name: 'Violet Dark', hex: '#a29bfe' },
  { name: 'Sky Blue', hex: '#74b9ff' },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme, seedColor, setSeedColor } = useUIStore();
  const {
    normalization,
    crossfade,
    setCrossfade,
    lyricsOffset,
    setLyricsOffset,
    sponsorBlockEnabled,
    setSponsorBlockEnabled,
    discordRpcEnabled,
    setDiscordRpcEnabled,
    eqPreset,
    eqBands,
  } = usePlayerStore();
  const {
    hostingUrl,
    hostingClients,
    connectedUrl,
    togetherStatus,
  } = useTogetherStore();
  const {
    toggleNormalization,
    changeEq,
    startTogetherHost,
    stopTogetherHost,
    joinTogetherRoom,
    leaveTogetherRoom,
  } = usePlayer();

  const [togetherJoinInput, setTogetherJoinInput] = useState('');

  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [sessionKey, setSessionKey] = useState('');
  const [scrobbleStatus, setScrobbleStatus] = useState<string | null>(null);
  const [lbToken, setLbToken] = useState('');
  const [lbStatus, setLbStatus] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<'openai' | 'openrouter' | 'gemini'>('openai');
  const [aiModel, setAiModel] = useState('gpt-4o-mini');
  const [aiLanguage, setAiLanguage] = useState('English');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [ytConnected, setYtConnected] = useState(false);
  const [ytStatusMsg, setYtStatusMsg] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<{
    checking: boolean;
    text?: string;
    url?: string;
  }>({ checking: false });

  useEffect(() => {
    window.electronAPI?.ytmusic
      ?.getAccountStatus()
      .then((res) => {
        if (res) setYtConnected(res.connected);
      })
      .catch(() => {});
    window.electronAPI?.ai
      ?.getConfig()
      .then((cfg) => {
        if (!cfg) return;
        setAiProvider(cfg.provider);
        setAiModel(cfg.model);
        setAiLanguage(cfg.targetLanguage);
        if (cfg.configured) setAiStatus('API key configured');
      })
      .catch(() => {});
  }, []);

  const handleSaveAI = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await window.electronAPI?.ai?.configure({
      provider: aiProvider,
      apiKey: aiApiKey,
      model: aiModel,
      targetLanguage: aiLanguage,
    });
    if (res?.ok) {
      setAiApiKey('');
      setAiStatus(res.configured ? 'AI translation settings saved!' : 'Saved (add an API key to translate)');
    }
  };

  const handleSaveListenBrainz = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await window.electronAPI?.scrobble.configureListenBrainz(lbToken);
    if (res?.ok) {
      setLbStatus(lbToken.trim() ? 'ListenBrainz token saved!' : 'ListenBrainz disabled.');
    }
  };

  const handleCheckUpdates = async () => {
    setUpdateStatus({ checking: true });
    const res = await window.electronAPI?.checkUpdates();
    if (!res?.ok) {
      setUpdateStatus({ checking: false, text: `Update check failed: ${res?.error || 'network error'}` });
      return;
    }
    if (res.hasUpdate) {
      setUpdateStatus({
        checking: false,
        text: `Update available: v${res.latestVersion} (current v${res.currentVersion})`,
        url: res.url,
      });
    } else {
      setUpdateStatus({ checking: false, text: `You're up to date (v${res.currentVersion})` });
    }
  };

  const handleSaveScrobble = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await window.electronAPI?.scrobble.configure(apiKey, apiSecret, sessionKey);
      if (res?.ok) {
        setScrobbleStatus('Last.fm credentials configured successfully!');
      } else {
        setScrobbleStatus('Failed to configure Last.fm.');
      }
    } catch {
      setScrobbleStatus('Error configuring Last.fm credentials.');
    }
  };

  return (
    <div className="p-6 max-w-4xl space-y-8 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-on-surface mb-1">Settings</h1>
        <p className="text-sm text-on-surface-variant">Customize your ArchiveTune experience on Linux.</p>
      </div>

      {/* Theme & Material You */}
      <section className="bg-surface-container rounded-2xl p-5 space-y-5 border border-outline-variant/30">
        <div className="flex items-center gap-3">
          <Palette className="text-primary" size={22} />
          <div>
            <h2 className="text-base font-semibold text-on-surface">Material You Dynamic Theming</h2>
            <p className="text-xs text-on-surface-variant">Choose your accent palette and appearance mode</p>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-on-surface-variant mb-2 block">Theme Mode</label>
          <div className="flex gap-2">
            {(['dark', 'amoled', 'light'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setTheme(mode)}
                className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all ${
                  theme === mode
                    ? 'bg-primary text-on-primary shadow'
                    : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-on-surface-variant mb-2 block">Seed Accent Color</label>
          <div className="flex flex-wrap gap-3">
            {SEED_COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => setSeedColor(c.hex)}
                className={`w-9 h-9 rounded-full transition-transform flex items-center justify-center ${
                  seedColor === c.hex ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-surface' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.name}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Audio Playback & Enhancement (Mobile ArchiveTune Features) */}
      <section className="bg-surface-container rounded-2xl p-5 space-y-5 border border-outline-variant/30">
        <div className="flex items-center gap-3">
          <Sliders className="text-primary" size={22} />
          <div>
            <h2 className="text-base font-semibold text-on-surface">Playback & Audio Enhancements</h2>
            <p className="text-xs text-on-surface-variant">Features ported directly from ArchiveTune Mobile</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Volume Normalization */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-primary" />
                <span className="text-sm font-medium text-on-surface">Volume Normalization (Dynamic Audio Normalizer)</span>
              </div>
              <p className="text-xs text-on-surface-variant">
                Automatically adjusts loudness between quiet and loud tracks for consistent volume without clipping.
              </p>
            </div>
            <button
              onClick={toggleNormalization}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                normalization ? 'bg-primary' : 'bg-surface-container-highest'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  normalization ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Crossfade */}
          <div className="p-3 rounded-xl bg-surface-container-high space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-primary" />
                  <span className="text-sm font-medium text-on-surface">Audio Crossfade</span>
                </div>
                <p className="text-xs text-on-surface-variant">Fade seamlessly into the next track</p>
              </div>
              <span className="text-sm font-bold text-primary tabular-nums">
                {crossfade === 0 ? 'Off' : `${crossfade}s`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={crossfade}
              onChange={(e) => setCrossfade(parseInt(e.target.value, 10))}
              className="w-full accent-primary cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-on-surface-variant">
              <span>0s (Off)</span>
              <span>10s</span>
              <span>20s (Max)</span>
            </div>
          </div>

          {/* Lyrics Sync Default Offset */}
          <div className="p-3 rounded-xl bg-surface-container-high space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium text-on-surface">Global Lyrics Sync Offset</span>
                <p className="text-xs text-on-surface-variant">Shift lyrics timing earlier (-) or later (+)</p>
              </div>
              <span className="text-sm font-bold text-primary tabular-nums">
                {lyricsOffset > 0 ? `+${lyricsOffset}ms` : `${lyricsOffset}ms`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={-3000}
                max={3000}
                step={100}
                value={lyricsOffset}
                onChange={(e) => setLyricsOffset(parseInt(e.target.value, 10))}
                className="w-full accent-primary cursor-pointer"
              />
              <button
                onClick={() => setLyricsOffset(0)}
                className="px-3 py-1 rounded-lg bg-surface-container-highest text-xs font-semibold text-on-surface hover:text-primary transition-colors shrink-0"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Offline Downloads Folder */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high">
            <div className="flex items-center gap-3">
              <FolderDown size={18} className="text-primary" />
              <div>
                <span className="text-sm font-medium text-on-surface">Music Download Location</span>
                <p className="text-xs text-on-surface-variant">Downloaded tracks are saved to ~/Music in 320kbps MP3 / Opus</p>
              </div>
            </div>
            <span className="text-xs font-mono bg-surface-container-highest px-3 py-1.5 rounded-lg text-on-surface">
              ~/Music
            </span>
          </div>

          {/* SponsorBlock Auto-Skip */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high">
            <div>
              <span className="text-sm font-medium text-on-surface">SponsorBlock Auto-Skip</span>
              <p className="text-xs text-on-surface-variant">Skip non-music intros, outros, and sponsor segments on YouTube tracks</p>
            </div>
            <button
              onClick={() => setSponsorBlockEnabled(!sponsorBlockEnabled)}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                sponsorBlockEnabled ? 'bg-primary' : 'bg-surface-container-highest'
              }`}
              aria-label="Toggle SponsorBlock"
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                  sponsorBlockEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Discord Rich Presence */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high">
            <div>
              <span className="text-sm font-medium text-on-surface">Discord Rich Presence</span>
              <p className="text-xs text-on-surface-variant">Show currently playing song on your Discord profile</p>
            </div>
            <button
              onClick={() => setDiscordRpcEnabled(!discordRpcEnabled)}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                discordRpcEnabled ? 'bg-primary' : 'bg-surface-container-highest'
              }`}
              aria-label="Toggle Discord Rich Presence"
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                  discordRpcEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* 5-Band Graphic Equalizer */}
      <section className="bg-surface-container rounded-2xl p-5 space-y-4 border border-outline-variant/30">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Sliders className="text-primary" size={22} />
            <div>
              <h2 className="text-base font-semibold text-on-surface">Graphic Equalizer</h2>
              <p className="text-xs text-on-surface-variant">5-band frequency tuning (active via mpv audio filter)</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            {eqPreset}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.entries(EQ_PRESETS).map(([name, bands]) => (
            <button
              key={name}
              onClick={() => changeEq(bands, name)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                eqPreset === name
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-3 pt-2">
          {EQ_BAND_LABELS.map((label, idx) => {
            const val = eqBands[idx] ?? 0;
            return (
              <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-surface-container-high">
                <span className="text-[11px] font-mono font-semibold text-primary tabular-nums">
                  {val > 0 ? `+${val}dB` : `${val}dB`}
                </span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={val}
                  onChange={(e) => {
                    const next = [...eqBands];
                    next[idx] = parseInt(e.target.value, 10);
                    changeEq(next, 'Custom');
                  }}
                  className="w-full accent-primary cursor-pointer"
                  aria-label={`${label} band`}
                />
                <span className="text-[11px] font-medium text-on-surface-variant">{label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Audio Engine Backend Details */}
      <section className="bg-surface-container rounded-2xl p-5 space-y-4 border border-outline-variant/30">
        <div className="flex items-center gap-3">
          <Disc3 className="text-primary" size={22} />
          <div>
            <h2 className="text-base font-semibold text-on-surface">Audio Engine Architecture</h2>
            <p className="text-xs text-on-surface-variant">Cross-platform Linux & Windows playback pipeline</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-xl bg-surface-container-high flex flex-col gap-1">
            <span className="text-xs text-on-surface-variant">Backend Engine</span>
            <span className="font-medium text-on-surface">mpv IPC (UNIX / Named Pipes) + HTML5 Fallback</span>
          </div>
          <div className="p-3 rounded-xl bg-surface-container-high flex flex-col gap-1">
            <span className="text-xs text-on-surface-variant">Stream Resolver</span>
            <span className="font-medium text-on-surface">InnerTube (VPN-Aware) + Bundled yt-dlp</span>
          </div>
          <div className="p-3 rounded-xl bg-surface-container-high flex flex-col gap-1">
            <span className="text-xs text-on-surface-variant">Gapless & Crossfade</span>
            <span className="font-medium text-on-surface">Enabled (0–20s Dual-Audio & mpv)</span>
          </div>
          <div className="p-3 rounded-xl bg-surface-container-high flex flex-col gap-1">
            <span className="text-xs text-on-surface-variant">Lyrics Engine</span>
            <span className="font-medium text-on-surface">LRCLib + YouTube Music Synced Waterfall</span>
          </div>
        </div>
      </section>

      {/* Spotify Integration */}
      <section className="bg-surface-container rounded-2xl p-5 space-y-4 border border-outline-variant/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ListMusic className="text-[#1DB954]" size={22} />
            <div>
              <h2 className="text-base font-semibold text-on-surface">Spotify Integration</h2>
              <p className="text-xs text-on-surface-variant">Sync your Spotify Liked Songs & Playlists into ArchiveTune</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/spotify')}
            className="px-4 py-2 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-xs transition-colors shadow"
          >
            Open Spotify Connect
          </button>
        </div>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Matches ArchiveTune&apos;s SpotifyCore resolver — streams Spotify music via high-fidelity YouTube Music audio streams with synced lyrics.
        </p>
      </section>

      {/* YouTube Music Account */}
      <section className="bg-surface-container rounded-2xl p-5 space-y-3 border border-outline-variant/30">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Radio className="text-error" size={22} />
            <div>
              <h2 className="text-base font-semibold text-on-surface">YouTube Music Account</h2>
              <p className="text-xs text-on-surface-variant">
                {ytConnected ? 'Signed in — authenticated InnerTube requests active' : 'Sign in for personalized charts & age-restricted playback'}
              </p>
            </div>
          </div>
          {ytConnected ? (
            <button
              onClick={async () => {
                await window.electronAPI?.ytmusic.logout();
                setYtConnected(false);
                setYtStatusMsg('Signed out of YouTube Music.');
              }}
              className="px-4 py-2 rounded-xl bg-error-container text-on-error-container font-semibold text-xs hover:opacity-90"
            >
              Sign Out
            </button>
          ) : (
            <button
              onClick={async () => {
                setYtStatusMsg(null);
                const res = await window.electronAPI?.ytmusic.login();
                if (res?.ok) {
                  setYtConnected(true);
                  setYtStatusMsg('Signed in to YouTube Music!');
                } else if (res?.error) {
                  setYtStatusMsg(res.error);
                }
              }}
              className="px-4 py-2 rounded-xl bg-primary text-on-primary font-semibold text-xs hover:opacity-90"
            >
              Sign In with Google
            </button>
          )}
        </div>
        {ytStatusMsg && <p className="text-xs text-primary">{ytStatusMsg}</p>}
      </section>

      {/* Last.fm Scrobbler */}
      <section className="bg-surface-container rounded-2xl p-5 space-y-4 border border-outline-variant/30">
        <div className="flex items-center gap-3">
          <Radio className="text-primary" size={22} />
          <div>
            <h2 className="text-base font-semibold text-on-surface">Last.fm Scrobbler</h2>
            <p className="text-xs text-on-surface-variant">Scrobble played tracks and send live Now Playing status</p>
          </div>
        </div>

        <form onSubmit={handleSaveScrobble} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-on-surface-variant block mb-1">API Key</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Last.fm API Key"
                className="w-full px-3 py-2 text-sm rounded-xl bg-surface-container-high text-on-surface border border-outline-variant/20 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs text-on-surface-variant block mb-1">API Secret</label>
              <input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Shared Secret"
                className="w-full px-3 py-2 text-sm rounded-xl bg-surface-container-high text-on-surface border border-outline-variant/20 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs text-on-surface-variant block mb-1">Session Key</label>
              <input
                type="password"
                value={sessionKey}
                onChange={(e) => setSessionKey(e.target.value)}
                placeholder="Session Key"
                className="w-full px-3 py-2 text-sm rounded-xl bg-surface-container-high text-on-surface border border-outline-variant/20 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Save Credentials
          </button>
          {scrobbleStatus && (
            <p className="text-xs text-primary mt-2">{scrobbleStatus}</p>
          )}
        </form>
      </section>

      {/* ListenBrainz Scrobbler */}
      <section className="bg-surface-container rounded-2xl p-5 space-y-4 border border-outline-variant/30">
        <div className="flex items-center gap-3">
          <Radio className="text-primary" size={22} />
          <div>
            <h2 className="text-base font-semibold text-on-surface">ListenBrainz Scrobbler</h2>
            <p className="text-xs text-on-surface-variant">Submit playing-now & listens via your ListenBrainz user token</p>
          </div>
        </div>

        <form onSubmit={handleSaveListenBrainz} className="flex flex-col sm:flex-row gap-3">
          <input
            type="password"
            value={lbToken}
            onChange={(e) => setLbToken(e.target.value)}
            placeholder="ListenBrainz User Token"
            className="flex-1 px-3 py-2 text-sm rounded-xl bg-surface-container-high text-on-surface border border-outline-variant/20 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            Save Token
          </button>
        </form>
        {lbStatus && <p className="text-xs text-primary">{lbStatus}</p>}
      </section>

      {/* AI Lyrics Translation */}
      <section className="bg-surface-container rounded-2xl p-5 space-y-4 border border-outline-variant/30">
        <div className="flex items-center gap-3">
          <Languages className="text-primary" size={22} />
          <div>
            <h2 className="text-base font-semibold text-on-surface">AI Lyrics Translation</h2>
            <p className="text-xs text-on-surface-variant">Translate synced or plain lyrics using your own OpenAI, OpenRouter, or Gemini key</p>
          </div>
        </div>

        <form onSubmit={handleSaveAI} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-on-surface-variant block mb-1">Provider</label>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value as 'openai' | 'openrouter' | 'gemini')}
                className="w-full px-3 py-2 text-sm rounded-xl bg-surface-container-high text-on-surface border border-outline-variant/20 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-on-surface-variant block mb-1">Model</label>
              <input
                type="text"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="gpt-4o-mini / gemini-2.0-flash"
                className="w-full px-3 py-2 text-sm rounded-xl bg-surface-container-high text-on-surface border border-outline-variant/20 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs text-on-surface-variant block mb-1">Target Language</label>
              <input
                type="text"
                value={aiLanguage}
                onChange={(e) => setAiLanguage(e.target.value)}
                placeholder="English"
                className="w-full px-3 py-2 text-sm rounded-xl bg-surface-container-high text-on-surface border border-outline-variant/20 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="password"
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder="Paste API key (leave blank to keep existing)"
              className="flex-1 px-3 py-2 text-sm rounded-xl bg-surface-container-high text-on-surface border border-outline-variant/20 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition-opacity shrink-0"
            >
              Save AI Settings
            </button>
          </div>
          {aiStatus && <p className="text-xs text-primary">{aiStatus}</p>}
        </form>
      </section>

      {/* Together Mode (LAN Synced Listening) */}
      <section className="bg-surface-container rounded-2xl p-5 space-y-4 border border-outline-variant/30">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Users className="text-primary" size={22} />
            <div>
              <h2 className="text-base font-semibold text-on-surface">Together Mode (LAN Sync)</h2>
              <p className="text-xs text-on-surface-variant">Host a room or join a friend on the same LAN/VPN to sync playback</p>
            </div>
          </div>
          {hostingUrl ? (
            <button
              onClick={() => stopTogetherHost()}
              className="px-4 py-2 rounded-xl bg-error/20 text-error text-xs font-semibold hover:bg-error/30 transition-colors"
            >
              Stop Hosting
            </button>
          ) : (
            <button
              onClick={() => startTogetherHost()}
              className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Host Room
            </button>
          )}
        </div>

        {hostingUrl && (
          <div className="flex items-center justify-between flex-wrap gap-2 bg-primary/10 px-3.5 py-2.5 rounded-xl text-xs">
            <span className="text-on-surface font-mono select-all">{hostingUrl}</span>
            <span className="text-primary font-semibold">
              {hostingClients} listener{hostingClients === 1 ? '' : 's'} connected
            </span>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            joinTogetherRoom(togetherJoinInput);
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <input
            type="text"
            value={togetherJoinInput}
            onChange={(e) => setTogetherJoinInput(e.target.value)}
            placeholder="ws://192.168.x.x:47820"
            className="flex-1 px-3 py-2 text-sm rounded-xl bg-surface-container-high text-on-surface border border-outline-variant/20 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {connectedUrl ? (
            <button
              type="button"
              onClick={() => leaveTogetherRoom()}
              className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface text-xs font-medium hover:bg-surface-container-highest transition-colors shrink-0"
            >
              Leave Room
            </button>
          ) : (
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface text-xs font-medium hover:bg-surface-container-highest transition-colors shrink-0"
            >
              Join Room
            </button>
          )}
        </form>
        {togetherStatus && <p className="text-xs text-primary">{togetherStatus}</p>}
      </section>

      {/* About & Updates */}
      <section className="bg-surface-container rounded-2xl p-5 space-y-3 border border-outline-variant/30">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Info className="text-primary" size={22} />
            <div>
              <h2 className="text-base font-semibold text-on-surface">About ArchiveTune Desktop</h2>
              <p className="text-xs text-on-surface-variant">Version 1.2.0 Desktop Client</p>
            </div>
          </div>
          <button
            onClick={handleCheckUpdates}
            disabled={updateStatus.checking}
            className="px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-xs font-semibold text-on-surface transition-colors disabled:opacity-50"
          >
            {updateStatus.checking ? 'Checking...' : 'Check for Updates'}
          </button>
        </div>

        {updateStatus.text && (
          <div className="flex items-center gap-3 text-xs text-primary bg-primary/10 px-3 py-2 rounded-xl">
            <span>{updateStatus.text}</span>
            {updateStatus.url && (
              <button
                onClick={() => window.electronAPI?.openExternal(updateStatus.url!)}
                className="underline font-semibold"
              >
                Download Update
              </button>
            )}
          </div>
        )}

        <p className="text-sm text-on-surface-variant leading-relaxed">
          ArchiveTune Desktop is an open-source cross-platform music client for Linux and Windows replicating the features of ArchiveTune
          (Material You theming, synced lyrics, local library, YouTube Music streaming, Spotify integration, and Last.fm scrobbling).
        </p>

        <div className="flex gap-4 pt-2">
          <button
            onClick={() => window.electronAPI?.openExternal('https://github.com/rukamori/ArchiveTune')}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            Upstream ArchiveTune <ExternalLink size={12} />
          </button>
          <button
            onClick={() => window.electronAPI?.openExternal('https://github.com/hari45wavin/archivetune-desktop')}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            Desktop Client Repository <ExternalLink size={12} />
          </button>
        </div>
      </section>
    </div>
  );
}
