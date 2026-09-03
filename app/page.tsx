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
  const [currentView, setCurrentView] = useState<'home' | 'details' | 'watch'>('home');
  const [selectedAnimeId, setSelectedAnimeId] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('1');
  const [currentEpisode, setCurrentEpisode] = useState<AnimeEpisode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const playerRef = useRef<HTMLDivElement>(null);
  const artInstance = useRef<any>(null);

  const streamServer = (process.env.NEXT_PUBLIC_STREAM_SERVER || 'https://telegram-stream-server-vglf.onrender.com').replace(/\/$/, '');
  const csvUrl = process.env.NEXT_PUBLIC_SHEET_CSV_URL || '';

  // Synchronize Mobile Gesture / Hardware Back Button
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

  // Fetch Google Sheet Catalog
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
        console.error('Error fetching catalog:', err);
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

  // Video Player Mount & Audio Track Setup
  useEffect(() => {
    if (currentView !== 'watch' || !currentEpisode || !playerRef.current) return;

    if (artInstance.current) {
      artInstance.current.destroy(false);
      artInstance.current = null;
    }

    const defaultStreamUrl = `${streamServer}/watch/${currentEpisode.msg_id}?track=0`;

    // Fetch Audio Tracks from Render Engine
    fetch(`${streamServer}/api/tracks/${currentEpisode.msg_id}`)
      .then((res) => res.json())
      .then((trackData) => {
        const audioTracks = trackData.tracks || [{ id: 0, title: 'Default Audio' }];

        if (window.Artplayer && playerRef.current) {
          artInstance.current = new window.Artplayer({
            container: playerRef.current,
            url: defaultStreamUrl,
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
            settings: [
              {
                width: 200,
                html: 'Audio Track',
                tooltip: audioTracks[0]?.title || 'Default',
                selector: audioTracks.map((t: any, index: number) => ({
                  default: index === 0,
                  html: t.title,
                  trackId: t.id,
                })),
                onSelect: (item: any) => {
                  if (!artInstance.current) return item.html;
                  const currentTime = Math.floor(artInstance.current.currentTime || 0);
                  const newTrackUrl = `${streamServer}/watch/${currentEpisode.msg_id}?track=${item.trackId}&ss=${currentTime}`;
                  artInstance.current.switchUrl(newTrackUrl).then(() => {
                    artInstance.current.play();
                  });
                  return item.html;
                },
              },
            ],
          });
        }
      })
      .catch(() => {
        if (window.Artplayer && playerRef.current) {
          artInstance.current = new window.Artplayer({
            container: playerRef.current,
            url: defaultStreamUrl,
            type: 'mp4',
            volume: 0.8,
            autoplay: true,
            pip: true,
            setting: true,
            playbackRate: true,
            aspectRatio: true,
            fullscreen: true,
            fullscreenWeb: true,
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

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#141414', color: '#E50914', fontSize: '18px', fontWeight: 'bold' }}>
        Loading AnimeToon...
      </div>
    );
  }

  const featured = animeList[0]?.info;

  return (
    <div style={{ backgroundColor: '#141414', color: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background-color: #141414; }
        .nav-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 1000; display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; background: linear-gradient(180deg, rgba(0,0,0,0.9) 0%, transparent 100%); }
        .brand { color: #E50914; font-size: 22px; font-weight: 900; letter-spacing: 1px; cursor: pointer; text-transform: uppercase; }
        .search-box { display: flex; align-items: center; background: rgba(0,0,0,0.7); border: 1px solid rgba(255,255,255,0.2); border-radius: 20px; padding: 6px 12px; }
        .search-input { background: transparent; border: none; color: #fff; outline: none; font-size: 13px; width: 130px; }

        /* HERO */
        .hero { position: relative; height: 50vh; min-height: 360px; display: flex; flex-direction: column; justify-content: flex-end; padding: 20px; overflow: hidden; }
        .hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .hero-overlay { position: absolute; inset: 0; background: linear-gradient(0deg, #141414 8%, rgba(20,20,20,0.5) 50%, rgba(0,0,0,0.3) 100%); }
        .hero-content { position: relative; z-index: 2; max-width: 500px; }
        .badge { background: #E50914; color: #fff; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 3px; margin-right: 8px; }
        .hero-title { font-size: 24px; font-weight: 800; margin: 8px 0 6px 0; line-height: 1.2; text-shadow: 0 2px 10px rgba(0,0,0,0.8); }
        .hero-btn { display: inline-flex; align-items: center; gap: 8px; background: #fff; color: #000; border: none; padding: 8px 18px; border-radius: 4px; font-weight: 700; font-size: 14px; cursor: pointer; margin-top: 10px; }

        /* CATALOG */
        .catalog { padding: 16px; }
        .section-title { font-size: 16px; font-weight: 800; color: #fff; border-left: 3px solid #E50914; padding-left: 8px; margin-bottom: 12px; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        @media (min-width: 600px) { .grid { grid-template-columns: repeat(4, 1fr); gap: 14px; } }
        @media (min-width: 900px) { .grid { grid-template-columns: repeat(6, 1fr); gap: 16px; } }
        .card { background: #1c1c1c; border-radius: 6px; overflow: hidden; cursor: pointer; transition: transform 0.2s; }
        .card:hover { transform: scale(1.03); }
        .card-img { width: 100%; aspect-ratio: 2/3; object-fit: cover; display: block; }
        .card-meta { padding: 8px 6px; }
        .card-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* DETAILS */
        .details-hero { position: relative; width: 100%; height: 35vh; min-height: 240px; overflow: hidden; }
        .back-btn { position: absolute; top: 60px; left: 16px; z-index: 10; background: rgba(0,0,0,0.6); color: #fff; border: 1px solid rgba(255,255,255,0.3); padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: bold; cursor: pointer; }
        .details-info { padding: 16px; }
        .season-tabs { display: flex; gap: 8px; margin: 16px 0; overflow-x: auto; padding-bottom: 4px; }
        .season-btn { background: #222; border: 1px solid #333; color: #ccc; padding: 6px 14px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; }
        .season-btn.active { background: #E50914; border-color: #E50914; color: #fff; }

        /* EPISODE ROWS */
        .episode-list { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
        .ep-card { display: flex; align-items: center; background: #1a1a1a; border: 1px solid #282828; border-radius: 6px; padding: 8px 12px; cursor: pointer; text-decoration: none; color: #fff; }
        .ep-card:hover { background: #242424; }
        .ep-thumb-box { width: 100px; aspect-ratio: 16/9; background: #2a2a2a; border-radius: 4px; overflow: hidden; flex-shrink: 0; position: relative; }
        .ep-thumb-box img { width: 100%; height: 100%; object-fit: cover; }
        .ep-details { margin-left: 12px; flex-grow: 1; min-width: 0; }
        .ep-num { font-size: 11px; font-weight: bold; color: #888; text-transform: uppercase; }
        .ep-title { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }

        /* WATCH SCREEN */
        .player-screen { padding: 60px 14px 20px; max-width: 900px; margin: 0 auto; }
        .player-container { width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 8px; overflow: hidden; margin: 12px 0; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
      `}</style>

      {/* Top Navbar */}
      <nav className="nav-bar">
        <span className="brand" onClick={() => navigateTo('home')}>AnimeToon</span>
        {currentView === 'home' && (
          <div className="search-box">
            <input
              type="text"
              className="search-input"
              placeholder="Search anime..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </nav>

      {/* VIEW 1: HOME PAGE */}
      {currentView === 'home' && (
        <>
          {featured && (
            <header className="hero">
              <img src={featured.banner || featured.poster} alt={featured.title} className="hero-bg" />
              <div className="hero-overlay" />
              <div className="hero-content">
                <div>
                  <span className="badge">SERIES</span>
                  <span style={{ fontSize: '11px', color: '#46d369', fontWeight: 'bold' }}>★ {featured.rating || '7.5'}</span>
                  <span style={{ fontSize: '11px', color: '#bbb', marginLeft: '6px' }}>{featured.year || '2024'}</span>
                </div>
                <h1 className="hero-title">{featured.title}</h1>
                <p style={{ fontSize: '12px', color: '#ccc', margin: '4px 0 8px' }}>{featured.genres}</p>
                <button
                  className="hero-btn"
                  onClick={() => {
                    setSelectedAnimeId(featured.anime_id);
                    setSelectedSeason('1');
                    navigateTo('details');
                  }}
                >
                  View Episodes
                </button>
              </div>
            </header>
          )}

          <main className="catalog">
            <div className="section-title">All Anime Series</div>
            <div className="grid">
              {filteredList.map((item) => (
                <div
                  key={item.info.anime_id}
                  className="card"
                  onClick={() => {
                    setSelectedAnimeId(item.info.anime_id);
                    setSelectedSeason('1');
                    navigateTo('details');
                  }}
                >
                  <img src={item.info.poster || item.info.banner} alt={item.info.title} className="card-img" loading="lazy" />
                  <div className="card-meta">
                    <p className="card-name">{item.info.title}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888', marginTop: '4px' }}>
                      <span>{item.info.year || '2024'}</span>
                      <span style={{ color: '#46d369' }}>★ {item.info.rating || '7.0'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </main>
        </>
      )}

      {/* VIEW 2: SERIES DETAILS & SEASONS */}
      {currentView === 'details' && activeAnime && (
        <div>
          <div className="details-hero">
            <button className="back-btn" onClick={() => window.history.back()}>← Back to Home</button>
            <img src={activeAnime.info.banner || activeAnime.info.poster} alt={activeAnime.info.title} className="hero-bg" />
            <div className="hero-overlay" />
          </div>

          <div className="details-info">
            <h1 style={{ fontSize: '22px', fontWeight: '800' }}>{activeAnime.info.title}</h1>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {activeAnime.info.genres} • {activeAnime.info.year} • ★ {activeAnime.info.rating}
            </p>

            <div className="season-tabs">
              {availableSeasons.map((s) => (
                <button
                  key={s}
                  className={`season-btn ${selectedSeason === s ? 'active' : ''}`}
                  onClick={() => setSelectedSeason(s)}
                >
                  Season {s}
                </button>
              ))}
            </div>

            <div className="episode-list">
              {seasonEpisodes.map((ep) => (
                <div
                  key={ep.msg_id}
                  className="ep-card"
                  onClick={() => {
                    setCurrentEpisode(ep);
                    navigateTo('watch');
                  }}
                >
                  <div className="ep-thumb-box">
                    <img src={`${streamServer}/thumb/${ep.msg_id}`} alt={ep.ep_title} loading="lazy" />
                  </div>
                  <div className="ep-details">
                    <span className="ep-num">Episode {ep.episode}</span>
                    <p className="ep-title">{ep.ep_title}</p>
                  </div>
                  <span style={{ color: '#E50914', fontSize: '14px', fontWeight: 'bold' }}>▶</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: STREAMING PLAYER */}
      {currentView === 'watch' && currentEpisode && (
        <div className="player-screen">
          <button className="back-btn" style={{ position: 'static', marginBottom: '12px' }} onClick={() => window.history.back()}>
            ← Back to Episodes
          </button>

          <div className="player-container">
            <div ref={playerRef} style={{ width: '100%', height: '100%' }} />
          </div>

          <div style={{ marginTop: '10px' }}>
            <span style={{ color: '#E50914', fontSize: '11px', fontWeight: 'bold' }}>NOW STREAMING</span>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '4px 0' }}>{currentEpisode.title}</h2>
            <p style={{ fontSize: '12px', color: '#888' }}>
              Season {currentEpisode.season} Episode {currentEpisode.episode}: {currentEpisode.ep_title}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
