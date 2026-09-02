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
  const [scrolled, setScrolled] = useState(false);

  const playerRef = useRef<HTMLDivElement>(null);
  const artInstance = useRef<any>(null);

  const streamServer =
    process.env.NEXT_PUBLIC_STREAM_SERVER ||
    'https://telegram-stream-server-vglf.onrender.com';
  const csvUrl = process.env.NEXT_PUBLIC_SHEET_CSV_URL || '';

  // Track navbar transparency on scroll
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch and parse Google Sheet CSV
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
        console.error('Failed to load Google Sheet:', err);
        setLoading(false);
      });
  }, [csvUrl]);

  // Group anime entries
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

  // Mount ArtPlayer
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
        muted: false,
        autoplay: false,
        pip: true,
        autoSize: true,
        autoMini: true,
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
      <div className="flex min-h-screen items-center justify-center bg-[#141414]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#E50914] border-t-transparent"></div>
      </div>
    );
  }

  const heroItem = activeGroup?.info;

  return (
    <div className="min-h-screen bg-[#141414] text-[#E5E5E5] font-sans antialiased selection:bg-[#E50914] selection:text-white">
      {/* Netflix Top Navigation Bar */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-12 py-3 transition-colors duration-300 ${
          scrolled ? 'bg-[#141414]/95 backdrop-blur-md shadow-md' : 'bg-gradient-to-b from-black/80 via-black/40 to-transparent'
        }`}
      >
        <div className="flex items-center gap-6">
          <span className="text-xl md:text-2xl font-black tracking-wider text-[#E50914] uppercase drop-shadow">
            AnimeToon
          </span>
          <nav className="hidden sm:flex items-center gap-4 text-xs md:text-sm font-medium text-gray-300">
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="hover:text-white transition">Home</button>
            <button onClick={() => window.scrollTo({ top: 500, behavior: 'smooth' })} className="hover:text-white transition">Series</button>
          </nav>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-black/50 border border-white/20 rounded-full px-3 py-1 focus-within:border-white transition">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Titles, genres..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-white placeholder-gray-400 focus:outline-none w-28 sm:w-48"
          />
        </div>
      </header>

      {/* Netflix Hero Billboard */}
      {heroItem && (
        <section className="relative w-full h-[65vh] sm:h-[75vh] flex items-end justify-start overflow-hidden">
          {/* Background Backdrop with Overlays */}
          <div className="absolute inset-0 z-0">
            <img
              src={heroItem.banner || heroItem.poster}
              alt={heroItem.title}
              className="w-full h-full object-cover object-center scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/50 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/60 to-transparent w-full md:w-3/4" />
          </div>

          {/* Hero Content */}
          <div className="relative z-10 px-4 md:px-12 pb-12 max-w-2xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-white/80 tracking-widest uppercase">
              <span className="bg-[#E50914] text-white px-1.5 py-0.5 rounded text-[10px]">SERIES</span>
              <span>{heroItem.year || '2024'}</span>
              <span>•</span>
              <span className="text-green-400 font-semibold">{heroItem.rating ? `★ ${heroItem.rating}` : 'Top Rated'}</span>
            </div>

            <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white leading-tight drop-shadow-md">
              {heroItem.title}
            </h1>

            <p className="text-xs sm:text-sm text-gray-300 line-clamp-2">
              {heroItem.genres || 'Action, Adventure, Fantasy'}
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  const firstEp = activeGroup?.episodes[0];
                  if (firstEp) setCurrentEpisode(firstEp);
                  const el = document.getElementById('watch-player');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="flex items-center gap-2 bg-white text-black font-semibold text-xs sm:text-sm px-5 py-2 rounded hover:bg-white/90 active:scale-95 transition shadow-lg"
              >
                <svg className="w-4 h-4 fill-black" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Play S1 E1
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <main className="px-4 md:px-12 -mt-6 relative z-20 space-y-10 pb-20">
        {/* Cinema Video Player Section */}
        {currentEpisode && (
          <section id="watch-player" className="scroll-mt-20 max-w-5xl mx-auto space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <span className="text-xs font-bold tracking-wider text-[#E50914] uppercase">Currently Playing</span>
                <h2 className="text-lg sm:text-xl font-bold text-white leading-tight">
                  {currentEpisode.title}
                </h2>
                <p className="text-xs text-gray-400">
                  Season {currentEpisode.season || '1'} • Episode {currentEpisode.episode}: {currentEpisode.ep_title}
                </p>
              </div>
            </div>

            {/* 16:9 Video Canvas */}
            <div className="relative aspect-video w-full rounded-xl overflow-hidden shadow-2xl bg-black border border-white/10">
              <div ref={playerRef} className="w-full h-full" />
            </div>

            {/* Episode Rail */}
            {activeGroup && activeGroup.episodes.length > 1 && (
              <div className="space-y-2 pt-4">
                <h3 className="text-sm font-semibold text-white tracking-wide">Select Episode</h3>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-800">
                  {activeGroup.episodes.map((ep) => (
                    <button
                      key={ep.msg_id}
                      onClick={() => setCurrentEpisode(ep)}
                      className={`flex-shrink-0 px-4 py-2 rounded text-xs font-medium border transition ${
                        currentEpisode.msg_id === ep.msg_id
                          ? 'bg-[#E50914] border-[#E50914] text-white font-bold'
                          : 'bg-[#222] border-white/10 text-gray-300 hover:bg-[#333]'
                      }`}
                    >
                      EP {ep.episode}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Netflix Media Rail (Anime Series Catalog) */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg md:text-xl font-bold text-white tracking-wide">
            {searchQuery ? 'Search Results' : 'Trending Series'}
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {filteredList.map((item) => {
              const isSelected = activeGroup?.info.anime_id === item.info.anime_id;
              return (
                <div
                  key={item.info.anime_id}
                  onClick={() => {
                    setSelectedAnimeId(item.info.anime_id);
                    setCurrentEpisode(item.episodes[0]);
                    const el = document.getElementById('watch-player');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className={`group relative rounded-md overflow-hidden bg-[#1f1f1f] cursor-pointer transition duration-300 transform hover:scale-105 hover:z-30 hover:shadow-2xl ${
                    isSelected ? 'ring-2 ring-[#E50914]' : ''
                  }`}
                >
                  {/* Aspect Ratio 2:3 Vertical Poster */}
                  <div className="aspect-[2/3] w-full relative overflow-hidden">
                    <img
                      src={item.info.poster || item.info.banner}
                      alt={item.info.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                      <p className="text-[11px] font-semibold text-white line-clamp-1">{item.info.title}</p>
                    </div>
                  </div>

                  {/* Card Bottom Meta */}
                  <div className="p-2 space-y-1">
                    <h3 className="text-xs font-semibold text-white truncate">{item.info.title}</h3>
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>{item.info.year || '2024'}</span>
                      <span className="text-green-400 font-semibold">{item.info.rating ? `★ ${item.info.rating}` : 'HD'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
