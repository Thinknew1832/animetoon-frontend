'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

interface AnimeEpisode {
  anime_id: string;
  title: string;
  banner: string;
  poster: string;
  genres: string;
  rating: string;
  year: string;
  season: string;
  episode: string;
  ep_title: string;
  msg_id: string;
}

interface AudioTrack {
  id: number;
  title: string;
}

declare global {
  interface Window {
    Artplayer: any;
  }
}

export default function NetflixAnimeApp() {
  const [data, setData] = useState<AnimeEpisode[]>([]);
  const [currentView, setCurrentView] = useState<'home' | 'details' | 'watch'>('home');
  const [selectedAnimeId, setSelectedAnimeId] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('1');
  const [currentEpisode, setCurrentEpisode] = useState<AnimeEpisode | null>(null);
  const [activeCategory, setActiveCategory] = useState<'all' | 'tv' | 'movies' | 'mylist'>('all');
  const [detailTab, setDetailTab] = useState<'episodes' | 'trailers' | 'more'>('episodes');
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const playerRef = useRef<HTMLDivElement>(null);
  const artInstance = useRef<any>(null);

  const streamServer = (process.env.NEXT_PUBLIC_STREAM_SERVER || 'https://telegram-stream-server-vglf.onrender.com').replace(/\/$/, '');
  const csvUrl = process.env.NEXT_PUBLIC_SHEET_CSV_URL || '';

  // Synchronize Mobile Hardware & Gesture Back Button
  const navigateTo = (view: 'home' | 'details' | 'watch', push = true) => {
    setCurrentView(view);
    if (push) {
      window.history.pushState({ view }, '', '');
    }
  };

  useEffect(() => {
    window.history.replaceState({ view: 'home' }, '', '');

    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setCurrentView(event.state.view);
      } else {
        setCurrentView('home');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch Catalog from Google Sheet
  useEffect(() => {
    if (!csvUrl) {
      setLoading(false);
      return;
    }

    fetch(csvUrl)
      .then((res) => res.text())
      .then((text) => {
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let currentCell = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          const nextChar = text[i + 1];

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              currentCell += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell.trim());
            currentCell = '';
          } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            currentRow.push(currentCell.trim());
            if (currentRow.some((c) => c !== '')) rows.push(currentRow);
            currentRow = [];
            currentCell = '';
          } else {
            currentCell += char;
          }
        }
        if (currentCell || currentRow.length > 0) {
          currentRow.push(currentCell.trim());
          if (currentRow.some((c) => c !== '')) rows.push(currentRow);
        }

        if (rows.length < 2) {
          setLoading(false);
          return;
        }

        const headers = rows[0].map((h) => h.toLowerCase().trim());
        const parsed: AnimeEpisode[] = rows.slice(1).map((r) => {
          const item: any = {};
          headers.forEach((h, idx) => {
            item[h] = r[idx] || '';
          });
          return item as AnimeEpisode;
        });

        setData(parsed);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Catalog load error:', err);
        setLoading(false);
      });
  }, [csvUrl]);

  const animeList = useMemo(() => {
    const map = new Map<string, { info: AnimeEpisode; episodes: AnimeEpisode[] }>();
    data.forEach((ep) => {
      if (!map.has(ep.anime_id)) {
        map.set(ep.anime_id, { info: ep, episodes: [] });
      }
      map.get(ep.anime_id)!.episodes.push(ep);
    });
    return Array.from(map.values());
  }, [data]);

  const activeAnime = useMemo(() => {
    return animeList.find((a) => a.info.anime_id === selectedAnimeId) || null;
  }, [animeList, selectedAnimeId]);

  const availableSeasons = useMemo(() => {
    if (!activeAnime) return ['1'];
    const sSet = new Set<string>();
    activeAnime.episodes.forEach((ep) => sSet.add(ep.season || '1'));
    return Array.from(sSet).sort((a, b) => Number(a) - Number(b));
  }, [activeAnime]);

  const seasonEpisodes = useMemo(() => {
    if (!activeAnime) return [];
    return activeAnime.episodes
      .filter((ep) => (ep.season || '1') === selectedSeason)
      .sort((a, b) => Number(a.episode) - Number(b.episode));
  }, [activeAnime, selectedSeason]);

  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return animeList;
    return animeList.filter((a) =>
      a.info.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.info.genres.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [animeList, searchQuery]);

  // Video Player Setup with Audio Switcher
  useEffect(() => {
    if (currentView !== 'watch' || !currentEpisode || !playerRef.current) return;

    if (artInstance.current) {
      artInstance.current.destroy(false);
      artInstance.current = null;
    }

    setActiveTrackId(0);
    const initialUrl = `${streamServer}/watch/${currentEpisode.msg_id}?track=0`;

    fetch(`${streamServer}/api/tracks/${currentEpisode.msg_id}`)
      .then((res) => res.json())
      .then((meta) => {
        const tracks: AudioTrack[] = meta.tracks && meta.tracks.length > 0
          ? meta.tracks
          : [{ id: 0, title: 'Default Audio' }];
        setAudioTracks(tracks);

        if (window.Artplayer && playerRef.current) {
          artInstance.current = new window.Artplayer({
            container: playerRef.current,
            url: initialUrl,
            type: 'mp4',
            volume: 0.8,
            autoplay: true,
            pip: true,
            screenshot: true,
            setting: true,
            playbackRate: true,
            aspectRatio: true,
            fullscreen: true,
            fullscreenWeb: true,
            theme: '#E50914',
          });
        }
      })
      .catch(() => {
        setAudioTracks([{ id: 0, title: 'Default Audio' }]);
        if (window.Artplayer && playerRef.current) {
          artInstance.current = new window.Artplayer({
            container: playerRef.current,
            url: initialUrl,
            type: 'mp4',
            volume: 0.8,
            autoplay: true,
            fullscreen: true,
            theme: '#E50914',
          });
        }
      });

    return () => {
      if (artInstance.current) {
        artInstance.current.destroy(false);
        artInstance.current = null;
      }
    };
  }, [currentView, currentEpisode, streamServer]);

  const handleSwitchAudio = (trackId: number) => {
    if (!currentEpisode || !artInstance.current) return;
    setActiveTrackId(trackId);
    const currentTime = Math.floor(artInstance.current.currentTime || 0);
    const newTrackUrl = `${streamServer}/watch/${currentEpisode.msg_id}?track=${trackId}&ss=${currentTime}`;
    artInstance.current.switchUrl(newTrackUrl).then(() => {
      artInstance.current.play();
    });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: '#E50914', fontSize: '18px', fontWeight: 'bold' }}>
        Loading AnimeToon...
      </div>
    );
  }

  const featured = animeList[0]?.info;

  return (
    <div style={{ backgroundColor: '#000', color: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        body { background-color: #000; overflow-x: hidden; }

        /* NETFLIX TOP BAR (IMAGE 1) */
        .netflix-header { position: sticky; top: 0; left: 0; right: 0; z-index: 100; background: #000; padding: 12px 16px 8px; }
        .netflix-top-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .menu-icon { width: 24px; height: 18px; display: flex; flex-direction: column; justify-content: space-between; cursor: pointer; }
        .menu-icon span { display: block; height: 2.5px; width: 100%; background-color: #fff; border-radius: 2px; }
        .netflix-logo { color: #E50914; font-size: 26px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; }
        .profile-avatar { width: 28px; height: 28px; border-radius: 4px; background: #E50914; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; }

        /* HORIZONTAL SUB-NAV TABS */
        .subnav-tabs { display: flex; justify-content: space-around; align-items: center; font-size: 13px; color: #aaa; font-weight: 600; padding-bottom: 6px; }
        .subnav-item { cursor: pointer; padding: 4px 6px; position: relative; transition: color 0.2s; }
        .subnav-item.active { color: #fff; }
        .subnav-item.active::after { content: ''; position: absolute; bottom: -4px; left: 10%; width: 80%; height: 2.5px; background: #fff; border-radius: 2px; }

        /* 3D BILLBOARD CARD (IMAGE 1) */
        .billboard-container { padding: 14px 16px 20px; display: flex; justify-content: center; }
        .billboard-card { position: relative; width: 100%; max-width: 480px; aspect-ratio: 4/5; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 36px rgba(0,0,0,0.9); cursor: pointer; border: 1px solid rgba(255,255,255,0.1); }
        .billboard-img { width: 100%; height: 100%; object-fit: cover; }
        .billboard-gradient { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.85) 85%, #000 100%); }
        .billboard-details { position: absolute; bottom: 16px; left: 16px; right: 16px; text-align: center; }
        .series-badge { font-size: 10px; letter-spacing: 4px; font-weight: 800; color: #E50914; margin-bottom: 4px; text-transform: uppercase; }
        .billboard-title { font-size: 26px; font-weight: 900; letter-spacing: 1px; line-height: 1.1; margin-bottom: 6px; text-shadow: 0 2px 10px rgba(0,0,0,0.9); }
        .billboard-tags { font-size: 11px; color: #ccc; font-weight: 500; }

        /* CATALOG SHELF */
        .shelf { padding: 8px 16px 24px; }
        .shelf-title { font-size: 16px; font-weight: 800; margin-bottom: 12px; color: #fff; }
        .shelf-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        @media (min-width: 768px) { .shelf-grid { grid-template-columns: repeat(6, 1fr); gap: 14px; } }
        .poster-card { border-radius: 6px; overflow: hidden; background: #181818; cursor: pointer; transition: transform 0.2s; }
        .poster-card:hover { transform: scale(1.04); }
        .poster-img { width: 100%; aspect-ratio: 2/3; object-fit: cover; display: block; }
        .poster-title { font-size: 11px; font-weight: 600; padding: 6px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* DETAIL MODAL / SHEET (IMAGE 2) */
        .detail-sheet { position: relative; min-height: 100vh; background-color: #000; padding-bottom: 40px; }
        .sheet-ambient-bg { position: absolute; top: 0; left: 0; right: 0; height: 380px; overflow: hidden; z-index: 1; }
        .sheet-ambient-img { width: 100%; height: 100%; object-fit: cover; filter: blur(35px) brightness(0.4); transform: scale(1.2); }
        .close-circle-btn { position: absolute; top: 16px; right: 16px; z-index: 10; width: 32px; height: 32px; border-radius: 50%; background: rgba(30,30,30,0.85); color: #fff; border: none; font-size: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; }

        .sheet-content { position: relative; z-index: 2; padding: 30px 18px 0; display: flex; flex-direction: column; align-items: center; }
        .sheet-poster-box { width: 160px; aspect-ratio: 2/3; border-radius: 8px; overflow: hidden; box-shadow: 0 14px 28px rgba(0,0,0,0.9); margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.15); }
        .sheet-poster-box img { width: 100%; height: 100%; object-fit: cover; }

        .rank-tag-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .top10-box { background: #E50914; color: #fff; font-size: 9px; font-weight: 900; line-height: 1; padding: 3px 4px; border-radius: 2px; text-align: center; }
        .rank-text { font-size: 13px; font-weight: 800; color: #fff; }

        .play-primary-btn { width: 100%; max-width: 440px; background: #E50914; color: #fff; border: none; padding: 12px; border-radius: 6px; font-size: 15px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; margin-bottom: 14px; }
        .sheet-synopsis { font-size: 12px; line-height: 1.5; color: #ccc; text-align: left; width: 100%; max-width: 440px; margin-bottom: 16px; }

        /* ACTION BUTTONS (MY LIST, RATE, SHARE) */
        .actions-row { display: flex; justify-content: space-around; width: 100%; max-width: 360px; margin-bottom: 20px; border-bottom: 1px solid #222; padding-bottom: 16px; }
        .action-col { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; color: #aaa; cursor: pointer; font-weight: 600; }
        .action-icon { font-size: 18px; color: #fff; }

        /* DETAIL TABS (EPISODES, TRAILERS, MORE) */
        .detail-tabs-header { display: flex; width: 100%; max-width: 440px; border-bottom: 2px solid #222; margin-bottom: 14px; }
        .detail-tab-btn { flex: 1; padding: 8px 0; background: none; border: none; font-size: 12px; font-weight: 800; color: #777; cursor: pointer; text-transform: uppercase; position: relative; }
        .detail-tab-btn.active { color: #fff; }
        .detail-tab-btn.active::after { content: ''; position: absolute; bottom: -2px; left: 0; right: 0; height: 3px; background: #E50914; }

        .season-dropdown { align-self: flex-start; background: #1c1c1c; border: 1px solid #333; color: #fff; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 700; margin-bottom: 14px; outline: none; }

        /* EPISODE ROW ITEMS */
        .ep-list-container { width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 14px; }
        .ep-item { display: flex; gap: 12px; align-items: center; background: #141414; border-radius: 6px; padding: 8px; cursor: pointer; }
        .ep-item:hover { background: #1c1c1c; }
        .ep-thumbnail-wrapper { width: 110px; aspect-ratio: 16/9; position: relative; border-radius: 4px; overflow: hidden; background: #222; flex-shrink: 0; }
        .ep-thumbnail-wrapper img { width: 100%; height: 100%; object-fit: cover; }
        .ep-play-circle { position: absolute; inset: 0; margin: auto; width: 26px; height: 26px; border-radius: 50%; background: rgba(0,0,0,0.6); border: 1.5px solid #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; }
        .ep-info-col { flex-grow: 1; min-width: 0; }
        .ep-title-text { font-size: 12px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ep-desc-text { font-size: 10px; color: #888; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

        /* WATCH SCREEN */
        .player-screen { padding: 16px; max-width: 900px; margin: 0 auto; }
        .player-container { width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 8px; overflow: hidden; margin: 12px 0; }
        .audio-track-container { display: flex; gap: 8px; overflow-x: auto; padding: 6px 0 12px; }
        .audio-track-btn { background: #1c1c1c; border: 1px solid #333; color: #ddd; padding: 6px 14px; border-radius: 4px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .audio-track-btn.active { background: #E50914; border-color: #E50914; color: #fff; }
      `}</style>

      {/* ============================================================ */}
      {/* 1. HOME SCREEN (IMAGE 1)                                    */}
      {/* ============================================================ */}
      {currentView === 'home' && (
        <div>
          {/* Header */}
          <header className="netflix-header">
            <div className="netflix-top-row">
              <div className="menu-icon">
                <span />
                <span />
                <span />
              </div>
              <div className="netflix-logo" onClick={() => navigateTo('home')}>NETFLIX</div>
              <div className="profile-avatar">A</div>
            </div>

            {/* Sub-nav Tabs */}
            <nav className="subnav-tabs">
              <span
                className={`subnav-item ${activeCategory === 'all' ? 'active' : ''}`}
                onClick={() => setActiveCategory('all')}
              >
                All
              </span>
              <span
                className={`subnav-item ${activeCategory === 'tv' ? 'active' : ''}`}
                onClick={() => setActiveCategory('tv')}
              >
                TV Shows
              </span>
              <span
                className={`subnav-item ${activeCategory === 'movies' ? 'active' : ''}`}
                onClick={() => setActiveCategory('movies')}
              >
                Movies
              </span>
              <span
                className={`subnav-item ${activeCategory === 'mylist' ? 'active' : ''}`}
                onClick={() => setActiveCategory('mylist')}
              >
                My List
              </span>
            </nav>
          </header>

          {/* 3D Elevated Billboard Card */}
          {featured && (
            <div className="billboard-container">
              <div
                className="billboard-card"
                onClick={() => {
                  setSelectedAnimeId(featured.anime_id);
                  setSelectedSeason('1');
                  navigateTo('details');
                }}
              >
                <img
                  src={featured.banner || featured.poster}
                  alt={featured.title}
                  className="billboard-img"
                />
                <div className="billboard-gradient" />
                <div className="billboard-details">
                  <div className="series-badge">N SERIES</div>
                  <h1 className="billboard-title">{featured.title}</h1>
                  <div className="billboard-tags">{featured.genres} • ★ {featured.rating || '8.5'}</div>
                </div>
              </div>
            </div>
          )}

          {/* All Anime Grid */}
          <section className="shelf">
            <h2 className="shelf-title">Popular Anime</h2>
            <div className="shelf-grid">
              {filteredList.map((item) => (
                <div
                  key={item.info.anime_id}
                  className="poster-card"
                  onClick={() => {
                    setSelectedAnimeId(item.info.anime_id);
                    setSelectedSeason('1');
                    navigateTo('details');
                  }}
                >
                  <img
                    src={item.info.poster || item.info.banner}
                    alt={item.info.title}
                    className="poster-img"
                    loading="lazy"
                  />
                  <p className="poster-title">{item.info.title}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. ANIME DETAIL SCREEN (IMAGE 2)                           */}
      {/* ============================================================ */}
      {currentView === 'details' && activeAnime && (
        <div className="detail-sheet">
          {/* Ambient Blurred Background */}
          <div className="sheet-ambient-bg">
            <img
              src={activeAnime.info.banner || activeAnime.info.poster}
              alt=""
              className="sheet-ambient-img"
            />
          </div>

          {/* Close Button */}
          <button className="close-circle-btn" onClick={() => window.history.back()}>
            ✕
          </button>

          <div className="sheet-content">
            {/* Centered Poster Box */}
            <div className="sheet-poster-box">
              <img
                src={activeAnime.info.poster || activeAnime.info.banner}
                alt={activeAnime.info.title}
              />
            </div>

            {/* Top 10 Badge */}
            <div className="rank-tag-row">
              <div className="top10-box">TOP<br />10</div>
              <span className="rank-text">#1 in Anime Series Today</span>
            </div>

            {/* Full-width Play Button */}
            <button
              className="play-primary-btn"
              onClick={() => {
                if (seasonEpisodes.length > 0) {
                  setCurrentEpisode(seasonEpisodes[0]);
                  navigateTo('watch');
                }
              }}
            >
              ▶ Play
            </button>

            {/* Synopsis */}
            <p className="sheet-synopsis">
              {activeAnime.info.genres} • Released {activeAnime.info.year} • Rating: ★ {activeAnime.info.rating}.
              Join the adventure as unexpected powers reshape fates in this acclaimed seasonal hit.
            </p>

            {/* Action Bar */}
            <div className="actions-row">
              <div className="action-col">
                <span className="action-icon">+</span>
                <span>My List</span>
              </div>
              <div className="action-col">
                <span className="action-icon">👍</span>
                <span>Rate</span>
              </div>
              <div className="action-col">
                <span className="action-icon">✈</span>
                <span>Share</span>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="detail-tabs-header">
              <button
                className={`detail-tab-btn ${detailTab === 'episodes' ? 'active' : ''}`}
                onClick={() => setDetailTab('episodes')}
              >
                EPISODES
              </button>
              <button
                className={`detail-tab-btn ${detailTab === 'trailers' ? 'active' : ''}`}
                onClick={() => setDetailTab('trailers')}
              >
                TRAILERS & MORE
              </button>
              <button
                className={`detail-tab-btn ${detailTab === 'more' ? 'active' : ''}`}
                onClick={() => setDetailTab('more')}
              >
                MORE LIKE THIS
              </button>
            </div>

            {/* Season Selector */}
            {detailTab === 'episodes' && (
              <>
                <select
                  className="season-dropdown"
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(e.target.value)}
                >
                  {availableSeasons.map((s) => (
                    <option key={s} value={s}>
                      Season {s}
                    </option>
                  ))}
                </select>

                {/* Episode Cards */}
                <div className="ep-list-container">
                  {seasonEpisodes.map((ep) => (
                    <div
                      key={ep.msg_id}
                      className="ep-item"
                      onClick={() => {
                        setCurrentEpisode(ep);
                        navigateTo('watch');
                      }}
                    >
                      <div className="ep-thumbnail-wrapper">
                        <img
                          src={`${streamServer}/thumb/${ep.msg_id}`}
                          alt={ep.ep_title}
                          loading="lazy"
                        />
                        <div className="ep-play-circle">▶</div>
                      </div>
                      <div className="ep-info-col">
                        <div className="ep-title-text">
                          {ep.episode}. {ep.ep_title}
                        </div>
                        <div className="ep-desc-text">
                          {ep.title} • Season {ep.season} Episode {ep.episode}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {detailTab !== 'episodes' && (
              <div style={{ color: '#666', fontSize: '12px', padding: '30px 0' }}>
                Content coming soon.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. WATCH PLAYER SCREEN                                      */}
      {/* ============================================================ */}
      {currentView === 'watch' && currentEpisode && (
        <div className="player-screen">
          <button
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: '10px',
            }}
            onClick={() => window.history.back()}
          >
            ← Back
          </button>

          <div className="player-container">
            <div ref={playerRef} style={{ width: '100%', height: '100%' }} />
          </div>

          {/* Audio Tracks Row */}
          {audioTracks.length > 1 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#888', margin: '8px 0 4px 0', textTransform: 'uppercase' }}>
                Audio Tracks
              </div>
              <div className="audio-track-container">
                {audioTracks.map((t) => (
                  <button
                    key={t.id}
                    className={`audio-track-btn ${activeTrackId === t.id ? 'active' : ''}`}
                    onClick={() => handleSwitchAudio(t.id)}
                  >
                    🔊 {t.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '12px' }}>
            <span style={{ color: '#E50914', fontSize: '11px', fontWeight: 800, letterSpacing: '1px' }}>
              NOW PLAYING
            </span>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '4px 0' }}>
              {currentEpisode.title}
            </h2>
            <p style={{ fontSize: '12px', color: '#888' }}>
              Season {currentEpisode.season} Episode {currentEpisode.episode}: {currentEpisode.ep_title}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
