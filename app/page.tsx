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

type ListStatus = 'plan' | 'watching' | 'onhold' | 'dropped' | 'completed';

interface SavedAnimeItem {
  anime_id: string;
  status: ListStatus;
}

declare global {
  interface Window {
    Artplayer: any;
  }
}

export default function NetflixAnimeApp() {
  const [data, setData] = useState<AnimeEpisode[]>([]);
  const [currentView, setCurrentView] = useState<'home' | 'details' | 'watch' | 'mylist'>('home');
  const [selectedAnimeId, setSelectedAnimeId] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('1');
  const [currentEpisode, setCurrentEpisode] = useState<AnimeEpisode | null>(null);
  const [activeCategory, setActiveCategory] = useState<'all' | 'tv' | 'movies' | 'mylist'>('all');
  const [myListFilter, setMyListFilter] = useState<ListStatus>('watching');
  const [savedList, setSavedList] = useState<SavedAnimeItem[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const playerRef = useRef<HTMLDivElement>(null);
  const artInstance = useRef<any>(null);
  const playbackTimeRef = useRef<number>(0);
  const totalDurationRef = useRef<number>(0);
  const lastTapTimeRef = useRef<number>(0);

  const streamServer = (process.env.NEXT_PUBLIC_STREAM_SERVER || 'https://telegram-stream-server-vglf.onrender.com').replace(/\/$/, '');
  const csvUrl = process.env.NEXT_PUBLIC_SHEET_CSV_URL || '';

  // LocalStorage Persistence
  useEffect(() => {
    try {
      const stored = localStorage.getItem('animetoon_mylist');
      if (stored) setSavedList(JSON.parse(stored));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const setAnimeStatus = (animeId: string, status: ListStatus) => {
    setSavedList((prev) => {
      const filtered = prev.filter((item) => item.anime_id !== animeId);
      const updated = [...filtered, { anime_id: animeId, status }];
      localStorage.setItem('animetoon_mylist', JSON.stringify(updated));
      return updated;
    });
    setShowStatusModal(false);
  };

  const removeFromList = (animeId: string) => {
    setSavedList((prev) => {
      const updated = prev.filter((item) => item.anime_id !== animeId);
      localStorage.setItem('animetoon_mylist', JSON.stringify(updated));
      return updated;
    });
    setShowStatusModal(false);
  };

  // Synchronized Hardware Back Navigation
  const navigateTo = (view: 'home' | 'details' | 'watch' | 'mylist', extraState: any = {}, push = true) => {
    setCurrentView(view);
    if (view === 'mylist') setActiveCategory('mylist');
    else if (view === 'home') setActiveCategory('all');
    if (push) {
      window.history.pushState({ view, ...extraState }, '', '');
    }
  };

  useEffect(() => {
    window.history.replaceState({ view: 'home' }, '', '');

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state;
      if (state && state.view) {
        if (state.view === 'details') {
          if (artInstance.current) {
            artInstance.current.destroy(false);
            artInstance.current = null;
          }
          if (state.animeId) setSelectedAnimeId(state.animeId);
          if (state.season) setSelectedSeason(state.season);
          setCurrentView('details');
        } else if (state.view === 'watch') {
          setCurrentView('watch');
        } else if (state.view === 'mylist') {
          setCurrentView('mylist');
        } else {
          if (artInstance.current) {
            artInstance.current.destroy(false);
            artInstance.current = null;
          }
          setCurrentView('home');
        }
      } else {
        if (artInstance.current) {
          artInstance.current.destroy(false);
          artInstance.current = null;
        }
        setCurrentView('home');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch Catalog from Google Sheet CSV
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

  const myListAnime = useMemo(() => {
    const ids = new Set(savedList.filter((item) => item.status === myListFilter).map((item) => item.anime_id));
    return animeList.filter((a) => ids.has(a.info.anime_id));
  }, [animeList, savedList, myListFilter]);

  const currentAnimeSavedItem = useMemo(() => {
    if (!activeAnime) return null;
    return savedList.find((i) => i.anime_id === activeAnime.info.anime_id) || null;
  }, [activeAnime, savedList]);

  // Audio Switcher & Fast Seek Connector
  const switchAudioTrack = (trackId: number, targetTime?: number) => {
    if (!currentEpisode || !artInstance.current) return;
    setActiveTrackId(trackId);

    const art = artInstance.current;
    const seekTo = targetTime !== undefined ? targetTime : Math.floor(art.currentTime || playbackTimeRef.current || 0);
    playbackTimeRef.current = seekTo;

    const newTrackUrl = `${streamServer}/watch/${currentEpisode.msg_id}?track=${trackId}&ss=${seekTo}`;

    art.switchUrl(newTrackUrl).then(() => {
      art.play().catch(() => {});
    }).catch(() => {
      art.url = newTrackUrl;
      art.play().catch(() => {});
    });
  };

  // Video Player Mount & Gesture Controller
  useEffect(() => {
    if (currentView !== 'watch' || !currentEpisode || !playerRef.current) return;

    if (artInstance.current) {
      artInstance.current.destroy(false);
      artInstance.current = null;
    }

    setActiveTrackId(0);
    playbackTimeRef.current = 0;

    fetch(`${streamServer}/api/tracks/${currentEpisode.msg_id}`)
      .then((res) => res.json())
      .then((meta) => {
        const tracks: AudioTrack[] = meta.tracks && meta.tracks.length > 0
          ? meta.tracks
          : [{ id: 0, title: 'Default Audio' }];
        setAudioTracks(tracks);

        const videoDuration = meta.duration && meta.duration > 0 ? meta.duration : 1440;
        totalDurationRef.current = videoDuration;

        const initialUrl = `${streamServer}/watch/${currentEpisode.msg_id}?track=0`;

        if (window.Artplayer && playerRef.current) {
          const art = new window.Artplayer({
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
            settings: [
              {
                width: 220,
                html: 'Audio Track',
                tooltip: tracks[0]?.title || 'Default Audio',
                selector: tracks.map((t, idx) => ({
                  default: idx === 0,
                  html: t.title,
                  trackId: t.id,
                })),
                onSelect: (item: any) => {
                  switchAudioTrack(item.trackId);
                  return item.html;
                },
              },
            ],
          });

          // Lock Duration on ready
          art.on('ready', () => {
            if (art.video && totalDurationRef.current > 0) {
              Object.defineProperty(art.video, 'duration', {
                get: () => totalDurationRef.current,
                configurable: true,
              });
            }
          });

          // Point 4: Auto-rotate to landscape on fullscreen
          art.on('fullscreen', (state: boolean) => {
            if (state && screen.orientation && 'lock' in screen.orientation) {
              (screen.orientation as any).lock('landscape').catch(() => {});
            } else if (!state && screen.orientation && 'unlock' in screen.orientation) {
              screen.orientation.unlock();
            }
          });

          // Point 5: Scrubbing/Seek handling without resets
          let isSeeking = false;
          art.on('video:seeking', () => {
            if (!isSeeking && art.currentTime > 0) {
              isSeeking = true;
              playbackTimeRef.current = Math.floor(art.currentTime);
              setTimeout(() => {
                isSeeking = false;
              }, 400);
            }
          });

          art.on('video:timeupdate', () => {
            if (art.currentTime > 0) {
              playbackTimeRef.current = Math.floor(art.currentTime);
            }
          });

          art.on('video:pause', () => {
            if (art.currentTime > 0) {
              playbackTimeRef.current = Math.floor(art.currentTime);
            }
          });

          // Point 6: Mobile Touch Gestures (Double-tap left/center/right)
          const videoElement = art.template.$video;
          if (videoElement) {
            videoElement.addEventListener('touchstart', (e: TouchEvent) => {
              const now = Date.now();
              const diff = now - lastTapTimeRef.current;
              if (diff < 300 && e.touches.length === 1) {
                const rect = videoElement.getBoundingClientRect();
                const x = e.touches[0].clientX - rect.left;
                const width = rect.width;

                if (x < width * 0.35) {
                  // Double tap left: Rewind 10s
                  const target = Math.max(0, (art.currentTime || playbackTimeRef.current) - 10);
                  art.notice.show = '⏪ 10s';
                  switchAudioTrack(activeTrackId, target);
                } else if (x > width * 0.65) {
                  // Double tap right: Forward 10s
                  const target = Math.min(totalDurationRef.current, (art.currentTime || playbackTimeRef.current) + 10);
                  art.notice.show = '⏩ 10s';
                  switchAudioTrack(activeTrackId, target);
                } else {
                  // Double tap center: Play / Pause toggle
                  if (art.playing) {
                    art.pause();
                    art.notice.show = '⏸ Paused';
                  } else {
                    art.play();
                    art.notice.show = '▶ Playing';
                  }
                }
              }
              lastTapTimeRef.current = now;
            });
          }

          artInstance.current = art;
        }
      })
      .catch(() => {
        const initialUrl = `${streamServer}/watch/${currentEpisode.msg_id}?track=0`;
        if (window.Artplayer && playerRef.current) {
          artInstance.current = new window.Artplayer({
            container: playerRef.current,
            url: initialUrl,
            type: 'mp4',
            volume: 0.8,
            autoplay: true,
            setting: true,
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

        /* HEADER CLEANED (POINT 1) */
        .netflix-header { position: sticky; top: 0; left: 0; right: 0; z-index: 100; background: #000; padding: 12px 16px 8px; }
        .netflix-top-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .netflix-logo { color: #E50914; font-size: 24px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; }
        .search-trigger-icon { font-size: 19px; cursor: pointer; color: #eee; }

        .search-bar-input { width: 100%; background: #1a1a1a; border: 1px solid #333; color: #fff; padding: 8px 14px; border-radius: 20px; font-size: 13px; outline: none; margin-bottom: 10px; }

        .subnav-tabs { display: flex; justify-content: space-around; align-items: center; font-size: 13px; color: #888; font-weight: 600; padding-bottom: 4px; }
        .subnav-item { cursor: pointer; padding: 4px 6px; position: relative; }
        .subnav-item.active { color: #fff; font-weight: 700; }

        /* 3D BILLBOARD CARD */
        .billboard-container { padding: 10px 16px 20px; display: flex; justify-content: center; }
        .billboard-card { position: relative; width: 100%; max-width: 480px; aspect-ratio: 4/5; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 36px rgba(0,0,0,0.9); cursor: pointer; border: 1px solid rgba(255,255,255,0.1); }
        .billboard-img { width: 100%; height: 100%; object-fit: cover; }
        .billboard-gradient { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.85) 85%, #000 100%); }
        .billboard-details { position: absolute; bottom: 16px; left: 16px; right: 16px; text-align: center; }
        .billboard-title { font-size: 24px; font-weight: 900; letter-spacing: 1px; line-height: 1.15; margin-bottom: 6px; text-shadow: 0 2px 10px rgba(0,0,0,0.9); }
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

        /* DETAIL SHEET (POINT 2) */
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
        .sheet-synopsis { font-size: 12px; line-height: 1.5; color: #ccc; text-align: left; width: 100%; max-width: 440px; margin-bottom: 18px; }

        /* CENTERED MY LIST BUTTON (POINT 2) */
        .mylist-center-action { display: flex; justify-content: center; width: 100%; max-width: 440px; margin-bottom: 24px; }
        .mylist-pill-trigger { display: flex; align-items: center; gap: 8px; background: #1f1f1f; border: 1px solid #333; padding: 8px 24px; border-radius: 24px; color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; }

        .season-header-row { width: 100%; max-width: 440px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #222; padding-bottom: 10px; }
        .episodes-title-text { font-size: 15px; font-weight: 800; text-transform: uppercase; color: #fff; }
        .season-dropdown { background: #1c1c1c; border: 1px solid #333; color: #fff; padding: 5px 12px; border-radius: 4px; font-size: 12px; font-weight: 700; outline: none; }

        /* EPISODE ROWS */
        .ep-list-container { width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 14px; }
        .ep-item { display: flex; gap: 12px; align-items: center; background: #141414; border-radius: 6px; padding: 8px; cursor: pointer; }
        .ep-item:hover { background: #1c1c1c; }
        .ep-thumbnail-wrapper { width: 110px; aspect-ratio: 16/9; position: relative; border-radius: 4px; overflow: hidden; background: #222; flex-shrink: 0; }
        .ep-thumbnail-wrapper img { width: 100%; height: 100%; object-fit: cover; }
        .ep-play-circle { position: absolute; inset: 0; margin: auto; width: 26px; height: 26px; border-radius: 50%; background: rgba(0,0,0,0.6); border: 1.5px solid #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; }
        .ep-info-col { flex-grow: 1; min-width: 0; }
        .ep-title-text { font-size: 12px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ep-desc-text { font-size: 10px; color: #888; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

        /* WATCH SCREEN & IN-PLAYER EPISODE LIST (POINT 3) */
        .player-screen { padding: 14px; max-width: 900px; margin: 0 auto; }
        .player-container { width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 8px; overflow: hidden; margin: 10px 0; }
        .watch-ep-section { margin-top: 24px; border-top: 1px solid #222; padding-top: 18px; }

        /* MY LIST SCREEN */
        .mylist-screen { padding: 16px; min-height: 100vh; background-color: #000; }
        .mylist-top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
        .mylist-title-row { display: flex; align-items: center; gap: 14px; }
        .back-icon-btn { background: none; border: none; color: #fff; font-size: 22px; cursor: pointer; }
        .mylist-heading { font-size: 22px; font-weight: 800; }

        .pill-bar { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 12px; margin-bottom: 16px; scrollbar-width: none; }
        .pill-bar::-webkit-scrollbar { display: none; }
        .pill-btn { background: #1a1a1a; border: 1px solid #333; color: #bbb; padding: 7px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer; }
        .pill-btn.active { background: #333; color: #fff; border-color: #555; }

        /* CATEGORY PICKER MODAL (POINT 2) */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 200; display: flex; align-items: flex-end; justify-content: center; }
        .modal-content { background: #1a1a1a; width: 100%; max-width: 440px; border-radius: 16px 16px 0 0; padding: 20px 18px 30px; border-top: 1px solid #333; }
        .modal-title { font-size: 16px; font-weight: 800; margin-bottom: 16px; text-align: center; }
        .modal-btn-list { display: flex; flex-direction: column; gap: 10px; }
        .modal-cat-btn { background: #262626; border: 1px solid #383838; color: #fff; padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 700; text-align: left; cursor: pointer; }
        .modal-cat-btn.current { border-color: #E50914; color: #E50914; }
        .modal-cancel-btn { background: none; border: none; color: #888; font-size: 13px; margin-top: 14px; text-align: center; width: 100%; cursor: pointer; }
      `}</style>

      {/* ============================================================ */}
      {/* 1. HOME SCREEN                                              */}
      {/* ============================================================ */}
      {currentView === 'home' && (
        <div>
          <header className="netflix-header">
            <div className="netflix-top-row">
              <div className="netflix-logo" onClick={() => navigateTo('home')}>NETFLIX</div>
              <div className="search-trigger-icon" onClick={() => setIsSearchOpen(!isSearchOpen)}>
                🔍
              </div>
            </div>

            {isSearchOpen && (
              <input
                type="text"
                className="search-bar-input"
                placeholder="Search anime, genres..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            )}

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
                onClick={() => navigateTo('mylist')}
              >
                My List
              </span>
            </nav>
          </header>

          {featured && (
            <div className="billboard-container">
              <div
                className="billboard-card"
                onClick={() => {
                  setSelectedAnimeId(featured.anime_id);
                  setSelectedSeason('1');
                  navigateTo('details', { animeId: featured.anime_id, season: '1' });
                }}
              >
                <img
                  src={featured.banner || featured.poster}
                  alt={featured.title}
                  className="billboard-img"
                />
                <div className="billboard-gradient" />
                <div className="billboard-details">
                  <h1 className="billboard-title">{featured.title}</h1>
                  <div className="billboard-tags">{featured.genres} • ★ {featured.rating || '8.5'}</div>
                </div>
              </div>
            </div>
          )}

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
                    navigateTo('details', { animeId: item.info.anime_id, season: '1' });
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
      {/* 2. ANIME DETAIL MODAL                                       */}
      {/* ============================================================ */}
      {currentView === 'details' && activeAnime && (
        <div className="detail-sheet">
          <div className="sheet-ambient-bg">
            <img
              src={activeAnime.info.banner || activeAnime.info.poster}
              alt=""
              className="sheet-ambient-img"
            />
          </div>

          <button className="close-circle-btn" onClick={() => window.history.back()}>
            ✕
          </button>

          <div className="sheet-content">
            <div className="sheet-poster-box">
              <img
                src={activeAnime.info.poster || activeAnime.info.banner}
                alt={activeAnime.info.title}
              />
            </div>

            <div className="rank-tag-row">
              <div className="top10-box">TOP<br />10</div>
              <span className="rank-text">#1 in Anime Series Today</span>
            </div>

            <button
              className="play-primary-btn"
              onClick={() => {
                if (seasonEpisodes.length > 0) {
                  setCurrentEpisode(seasonEpisodes[0]);
                  navigateTo('watch', { animeId: activeAnime.info.anime_id, season: selectedSeason });
                }
              }}
            >
              ▶ Play
            </button>

            <p className="sheet-synopsis">
              {activeAnime.info.genres} • Released {activeAnime.info.year} • Rating: ★ {activeAnime.info.rating}.
            </p>

            {/* Centered My List Button with Category Selector */}
            <div className="mylist-center-action">
              <button
                className="mylist-pill-trigger"
                onClick={() => setShowStatusModal(true)}
              >
                <span>{currentAnimeSavedItem ? '✓ In My List' : '+ Add to My List'}</span>
              </button>
            </div>

            <div className="season-header-row">
              <span className="episodes-title-text">Episodes</span>
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
            </div>

            <div className="ep-list-container">
              {seasonEpisodes.map((ep) => (
                <div
                  key={ep.msg_id}
                  className="ep-item"
                  onClick={() => {
                    setCurrentEpisode(ep);
                    navigateTo('watch', { animeId: activeAnime.info.anime_id, season: selectedSeason, epId: ep.msg_id });
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
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. DEDICATED MY LIST SCREEN                                 */}
      {/* ============================================================ */}
      {currentView === 'mylist' && (
        <div className="mylist-screen">
          <div className="mylist-top-bar">
            <div className="mylist-title-row">
              <button className="back-icon-btn" onClick={() => window.history.back()}>
                ←
              </button>
              <h1 className="mylist-heading">My List</h1>
            </div>
          </div>

          <div className="pill-bar">
            <button
              className={`pill-btn ${myListFilter === 'watching' ? 'active' : ''}`}
              onClick={() => setMyListFilter('watching')}
            >
              Watching
            </button>
            <button
              className={`pill-btn ${myListFilter === 'plan' ? 'active' : ''}`}
              onClick={() => setMyListFilter('plan')}
            >
              Plan to Watch
            </button>
            <button
              className={`pill-btn ${myListFilter === 'onhold' ? 'active' : ''}`}
              onClick={() => setMyListFilter('onhold')}
            >
              On Hold
            </button>
            <button
              className={`pill-btn ${myListFilter === 'dropped' ? 'active' : ''}`}
              onClick={() => setMyListFilter('dropped')}
            >
              Dropped
            </button>
            <button
              className={`pill-btn ${myListFilter === 'completed' ? 'active' : ''}`}
              onClick={() => setMyListFilter('completed')}
            >
              Completed
            </button>
          </div>

          {myListAnime.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#666', marginTop: '60px', fontSize: '14px' }}>
              No titles in this category.<br />Tap <b>+ Add to My List</b> on any title to organize it here.
            </div>
          ) : (
            <div className="shelf-grid">
              {myListAnime.map((item) => (
                <div
                  key={item.info.anime_id}
                  className="poster-card"
                  onClick={() => {
                    setSelectedAnimeId(item.info.anime_id);
                    setSelectedSeason('1');
                    navigateTo('details', { animeId: item.info.anime_id, season: '1' });
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
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. WATCH PLAYER SCREEN + IN-PLAYER EPISODES (POINT 3)       */}
      {/* ============================================================ */}
      {currentView === 'watch' && currentEpisode && (
        <div className="player-screen">
          <button
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onClick={() => window.history.back()}
          >
            ← Back
          </button>

          <div className="player-container">
            <div ref={playerRef} style={{ width: '100%', height: '100%' }} />
          </div>

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

          {/* Point 3: Episode List directly below the playing video */}
          <div className="watch-ep-section">
            <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '14px' }}>All Episodes</h3>
            <div className="ep-list-container">
              {seasonEpisodes.map((ep) => (
                <div
                  key={ep.msg_id}
                  className="ep-item"
                  style={{
                    border: ep.msg_id === currentEpisode.msg_id ? '1px solid #E50914' : '1px solid transparent',
                  }}
                  onClick={() => {
                    if (ep.msg_id !== currentEpisode.msg_id) {
                      setCurrentEpisode(ep);
                    }
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
                    <div className="ep-title-text" style={{ color: ep.msg_id === currentEpisode.msg_id ? '#E50914' : '#fff' }}>
                      {ep.episode}. {ep.ep_title}
                    </div>
                    <div className="ep-desc-text">
                      {ep.title} • Season {ep.season} Episode {ep.episode}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. ADD TO MY LIST STATUS MODAL                               */}
      {/* ============================================================ */}
      {showStatusModal && activeAnime && (
        <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Save to My List</h3>
            <div className="modal-btn-list">
              <button
                className={`modal-cat-btn ${currentAnimeSavedItem?.status === 'watching' ? 'current' : ''}`}
                onClick={() => setAnimeStatus(activeAnime.info.anime_id, 'watching')}
              >
                Watching {currentAnimeSavedItem?.status === 'watching' && '✓'}
              </button>
              <button
                className={`modal-cat-btn ${currentAnimeSavedItem?.status === 'plan' ? 'current' : ''}`}
                onClick={() => setAnimeStatus(activeAnime.info.anime_id, 'plan')}
              >
                Plan to Watch {currentAnimeSavedItem?.status === 'plan' && '✓'}
              </button>
              <button
                className={`modal-cat-btn ${currentAnimeSavedItem?.status === 'onhold' ? 'current' : ''}`}
                onClick={() => setAnimeStatus(activeAnime.info.anime_id, 'onhold')}
              >
                On Hold {currentAnimeSavedItem?.status === 'onhold' && '✓'}
              </button>
              <button
                className={`modal-cat-btn ${currentAnimeSavedItem?.status === 'dropped' ? 'current' : ''}`}
                onClick={() => setAnimeStatus(activeAnime.info.anime_id, 'dropped')}
              >
                Dropped {currentAnimeSavedItem?.status === 'dropped' && '✓'}
              </button>
              <button
                className={`modal-cat-btn ${currentAnimeSavedItem?.status === 'completed' ? 'current' : ''}`}
                onClick={() => setAnimeStatus(activeAnime.info.anime_id, 'completed')}
              >
                Completed {currentAnimeSavedItem?.status === 'completed' && '✓'}
              </button>
              {currentAnimeSavedItem && (
                <button
                  className="modal-cat-btn"
                  style={{ color: '#E50914', borderColor: '#4a1515' }}
                  onClick={() => removeFromList(activeAnime.info.anime_id)}
                >
                  Remove from List
                </button>
              )}
            </div>
            <button className="modal-cancel-btn" onClick={() => setShowStatusModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
