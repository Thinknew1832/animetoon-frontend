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

declare global {
  interface Window {
    Artplayer: any;
  }
}

export default function NetflixAnimeApp() {
  const [data, setData] = useState<AnimeEpisode[]>([]);
  const [selectedAnimeId, setSelectedAnimeId] = useState<string | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<AnimeEpisode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const playerRef = useRef<HTMLDivElement>(null);
  const artInstance = useRef<any>(null);

  const streamServer =
    process.env.NEXT_PUBLIC_STREAM_SERVER ||
    'https://telegram-stream-server-vglf.onrender.com';
  const csvUrl = process.env.NEXT_PUBLIC_SHEET_CSV_URL || '';

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
        if (parsed.length > 0) {
          setSelectedAnimeId(parsed[0].anime_id);
          setCurrentEpisode(parsed[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load Sheet:', err);
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

  const activeGroup = useMemo(() => {
    return animeList.find((a) => a.info.anime_id === selectedAnimeId) || animeList[0];
  }, [animeList, selectedAnimeId]);

  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return animeList;
    return animeList.filter((a) =>
      a.info.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.info.genres.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [animeList, searchQuery]);

  useEffect(() => {
    if (!currentEpisode || !playerRef.current) return;

    const streamUrl = `${streamServer.replace(/\/$/, '')}/watch/${currentEpisode.msg_id}`;

    if (artInstance.current) {
      artInstance.current.switchUrl(streamUrl);
      return;
    }

    if (window.Artplayer) {
      artInstance.current = new window.Artplayer({
        container: playerRef.current,
        url: streamUrl,
        type: 'mkv',
        isLive: false,
        autoplay: false,
        pip: true,
        autoSize: true,
        screenshot: true,
        setting: true,
        playbackRate: true,
        aspectRatio: true,
        fullscreen: true,
        fullscreenWeb: true,
        theme: '#E50914',
      });
    }

    return () => {
      if (artInstance.current) {
        artInstance.current.destroy(false);
        artInstance.current = null;
      }
    };
  }, [currentEpisode, streamServer]);

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#141414', color: '#E50914', fontSize: '20px', fontWeight: 'bold' }}>
        Loading AnimeToon...
      </div>
    );
  }

  const heroItem = activeGroup?.info;

  return (
    <div style={{ backgroundColor: '#141414', color: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', margin: 0, paddingBottom: '60px' }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background-color: #141414; }
        .netflix-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 1000; display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%); }
        .brand { color: #E50914; font-size: 24px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; text-decoration: none; }
        .search-box { display: flex; align-items: center; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.3); border-radius: 20px; padding: 6px 12px; }
        .search-input { background: transparent; border: none; color: #fff; outline: none; font-size: 13px; width: 140px; }
        .hero-banner { position: relative; width: 100%; height: 55vh; min-height: 380px; max-height: 520px; display: flex; flex-direction: column; justify-content: flex-end; padding: 24px 20px; overflow: hidden; }
        .hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
        .hero-gradient { position: absolute; inset: 0; background: linear-gradient(0deg, #141414 5%, rgba(20,20,20,0.6) 45%, rgba(0,0,0,0.2) 100%); z-index: 2; }
        .hero-info { position: relative; z-index: 3; max-width: 600px; }
        .badge { background-color: #E50914; color: #fff; padding: 2px 6px; font-size: 10px; font-weight: 800; border-radius: 3px; display: inline-block; margin-right: 8px; }
        .hero-title { font-size: 26px; font-weight: 800; margin: 8px 0 6px 0; line-height: 1.2; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
        .hero-meta { font-size: 12px; color: #bbb; margin-bottom: 12px; }
        .play-btn { display: inline-flex; align-items: center; gap: 8px; background-color: #fff; color: #000; border: none; padding: 9px 20px; border-radius: 4px; font-weight: 700; font-size: 14px; cursor: pointer; }
        .main-container { padding: 0 16px; margin-top: 10px; }
        .player-wrapper { max-width: 900px; margin: 0 auto 30px auto; }
        .player-aspect { width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.7); }
        .episodes-bar { display: flex; gap: 8px; overflow-x: auto; padding: 10px 0; scrollbar-width: none; }
        .ep-pill { flex: 0 0 auto; background: #222; color: #eee; border: 1px solid #333; padding: 6px 14px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; }
        .ep-pill.active { background: #E50914; border-color: #E50914; color: #fff; }
        .section-title { font-size: 17px; font-weight: 700; margin: 24px 0 12px 0; color: #fff; border-left: 3px solid #E50914; padding-left: 8px; }
        .grid-container { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        @media (min-width: 600px) { .grid-container { grid-template-columns: repeat(4, 1fr); gap: 14px; } }
        @media (min-width: 900px) { .grid-container { grid-template-columns: repeat(6, 1fr); gap: 16px; } }
        .card { background: #1c1c1c; border-radius: 4px; overflow: hidden; cursor: pointer; transition: transform 0.2s; }
        .card:hover { transform: scale(1.03); }
        .card-img-box { width: 100%; aspect-ratio: 2 / 3; position: relative; background: #222; }
        .card-img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .card-content { padding: 8px 6px; }
        .card-title { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0; color: #fff; }
        .card-sub { display: flex; justify-content: space-between; font-size: 10px; color: #888; margin-top: 4px; }
      `}</style>

      {/* Navigation */}
      <nav className="netflix-nav">
        <a href="/" className="brand">AnimeToon</a>
        <div className="search-box">
          <input
            type="text"
            className="search-input"
            placeholder="Search anime..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </nav>

      {/* Hero Billboard */}
      {heroItem && (
        <header className="hero-banner">
          <img src={heroItem.banner || heroItem.poster} alt={heroItem.title} className="hero-bg" />
          <div className="hero-gradient" />
          <div className="hero-info">
            <div>
              <span className="badge">SERIES</span>
              <span style={{ fontSize: '11px', color: '#46d369', fontWeight: 'bold' }}>★ {heroItem.rating || '7.5'}</span>
              <span style={{ fontSize: '11px', color: '#ccc', marginLeft: '8px' }}>{heroItem.year || '2024'}</span>
            </div>
            <h1 className="hero-title">{heroItem.title}</h1>
            <div className="hero-meta">{heroItem.genres || 'Action, Fantasy'}</div>
            <button
              className="play-btn"
              onClick={() => {
                const el = document.getElementById('player-anchor');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              ▶ Watch Episode
            </button>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="main-container">
        {/* Cinema Video Player Container */}
        {currentEpisode && (
          <section id="player-anchor" className="player-wrapper">
            <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <span style={{ color: '#E50914', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>NOW STREAMING</span>
                <h2 style={{ fontSize: '16px', margin: '2px 0', fontWeight: '700' }}>
                  {currentEpisode.title}
                </h2>
                <div style={{ fontSize: '12px', color: '#aaa' }}>
                  S{currentEpisode.season} E{currentEpisode.episode}: {currentEpisode.ep_title}
                </div>
              </div>
            </div>

            {/* 16:9 Cinema Aspect Ratio */}
            <div className="player-aspect">
              <div ref={playerRef} style={{ width: '100%', height: '100%' }} />
            </div>

            {/* Episode Selectors */}
            {activeGroup && activeGroup.episodes.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#aaa', marginBottom: '4px' }}>EPISODES</div>
                <div className="episodes-bar">
                  {activeGroup.episodes.map((ep) => (
                    <button
                      key={ep.msg_id}
                      className={`ep-pill ${currentEpisode.msg_id === ep.msg_id ? 'active' : ''}`}
                      onClick={() => setCurrentEpisode(ep)}
                    >
                      EP {ep.episode}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Media Row / Posters */}
        <section>
          <div className="section-title">All Anime Series</div>
          <div className="grid-container">
            {filteredList.map((item) => (
              <div
                key={item.info.anime_id}
                className="card"
                onClick={() => {
                  setSelectedAnimeId(item.info.anime_id);
                  if (item.episodes.length > 0) setCurrentEpisode(item.episodes[0]);
                  const el = document.getElementById('player-anchor');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {/* 2:3 Vertical Card Frame */}
                <div className="card-img-box">
                  <img src={item.info.poster || item.info.banner} alt={item.info.title} className="card-img" loading="lazy" />
                </div>
                <div className="card-content">
                  <p className="card-title">{item.info.title}</p>
                  <div className="card-sub">
                    <span>{item.info.year || '2024'}</span>
                    <span style={{ color: '#46d369' }}>★ {item.info.rating || '7.0'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
