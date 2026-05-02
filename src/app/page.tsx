'use client';

import { useEffect, useMemo, useState } from 'react';

type Sport = {
  id: string;
  name: string;
};

type MatchSource = {
  source: string;
  id: string;
};

type Team = {
  name?: string;
  badge?: string;
};

type Match = {
  id: string;
  title: string;
  category: string;
  date: number;
  poster?: string;
  popular: boolean;
  teams?: {
    home?: Team;
    away?: Team;
  };
  sources: MatchSource[];
};

type Stream = {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
};

type FilterKey = 'all' | 'football' | 'formula1' | 'live' | 'upcoming';

const API_BASE = 'https://streamed.pk/api';
const DISCLAIMER_KEY = 'hsn-plus-disclaimer-acknowledged';

function isFootballSport(sport: Sport) {
  const value = `${sport.id} ${sport.name}`.toLowerCase();
  return value.includes('football') || value.includes('soccer');
}

function isFormulaOneSport(sport: Sport) {
  const value = `${sport.id} ${sport.name}`.toLowerCase();
  return value.includes('formula 1') || value.includes('formula1') || value === 'f1' || value.includes(' f1 ');
}

function looksLikeFormulaOneMatch(match: Match) {
  return /formula\s*1|\bf1\b|grand prix|formula one/i.test(`${match.category} ${match.title}`);
}

function isAmericanFootballMatch(match: Match) {
  return /american football|nfl|college football|gridiron|super bowl|touchdown/i.test(
    `${match.category} ${match.title} ${match.teams?.home?.name ?? ''} ${match.teams?.away?.name ?? ''}`
  );
}

function isAmericanFootballSport(sport: Sport) {
  const value = `${sport.id} ${sport.name}`.toLowerCase();
  return /american football|nfl|college football|gridiron/.test(value);
}

function isRealFootballMatch(match: Match) {
  const combined = `${match.category} ${match.title} ${match.teams?.home?.name ?? ''} ${match.teams?.away?.name ?? ''}`.toLowerCase();

  return (
    combined.includes('football') ||
    combined.includes('soccer') ||
    combined.includes('futbol') ||
    combined.includes('fútbol') ||
    combined.includes('association football')
  );
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function buildPosterUrl(poster?: string) {
  if (!poster) {
    return null;
  }

  return poster.startsWith('http') ? poster : `https://streamed.pk${poster}.webp`;
}

function buildBadgeUrl(badge?: string) {
  if (!badge) {
    return null;
  }

  return `https://streamed.pk/api/images/badge/${badge}.webp`;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export default function Home() {
  const [sports, setSports] = useState<Sport[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [liveMatchIds, setLiveMatchIds] = useState<string[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  useEffect(() => {
    setShowDisclaimer(window.localStorage.getItem(DISCLAIMER_KEY) !== 'acknowledged');
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadFeed() {
      try {
        setLoadingFeed(true);
        setError(null);

        const [sportsResponse, allMatches, liveMatches] = await Promise.all([
          fetchJson<Sport[]>(`${API_BASE}/sports`, controller.signal),
          fetchJson<Match[]>(`${API_BASE}/matches/all`, controller.signal),
          fetchJson<Match[]>(`${API_BASE}/matches/live`, controller.signal)
        ]);

        const footballSportIds = sportsResponse
          .filter(isFootballSport)
          .map((sport) => sport.id);
        const formulaOneSportIds = sportsResponse.filter(isFormulaOneSport).map((sport) => sport.id);
        const allowedSportIds = new Set([...footballSportIds, ...formulaOneSportIds]);
        const liveIds = new Set(liveMatches.map((match) => match.id));

        const curatedMatches = allMatches
          .filter((match) => {
            return (
              allowedSportIds.has(match.category) ||
              isRealFootballMatch(match) ||
              looksLikeFormulaOneMatch(match)
            );
          })
          .sort((left, right) => {
            const leftLive = liveIds.has(left.id) ? 1 : 0;
            const rightLive = liveIds.has(right.id) ? 1 : 0;

            if (leftLive !== rightLive) {
              return rightLive - leftLive;
            }

            if (left.popular !== right.popular) {
              return Number(right.popular) - Number(left.popular);
            }

            return left.date - right.date;
          });

        setSports(sportsResponse);
        setMatches(curatedMatches);
        setLiveMatchIds([...liveIds]);
        setSelectedMatch((current) => current ?? curatedMatches[0] ?? null);
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name !== 'AbortError') {
          setError('Unable to load matches from the external API right now.');
        }
      } finally {
        setLoadingFeed(false);
      }
    }

    loadFeed();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const match = selectedMatch;

    if (!match) {
      setStreams([]);
      setActiveStream(null);
      return;
    }

    const controller = new AbortController();

    async function loadStreams() {
      try {
        setLoadingPlayer(true);
        setError(null);

        const source = match!.sources[0];

        if (!source) {
          throw new Error('No stream sources available.');
        }

        const streamList = await fetchJson<Stream[]>(
          `${API_BASE}/stream/${source.source}/${source.id}`,
          controller.signal
        );

        setStreams(streamList);
        setActiveStream(null);
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name !== 'AbortError') {
          setStreams([]);
          setActiveStream(null);
          setError('Unable to load stream embeds for the selected match.');
        }
      } finally {
        setLoadingPlayer(false);
      }
    }

    loadStreams();

    return () => controller.abort();
  }, [selectedMatch]);

  const visibleMatches = useMemo(() => {
    const now = Date.now();

    return matches.filter((match) => {
      if (activeFilter === 'football') {
        return isRealFootballMatch(match);
      }

      if (activeFilter === 'formula1') {
        return looksLikeFormulaOneMatch(match);
      }

      if (activeFilter === 'live') {
        return liveMatchIds.includes(match.id);
      }

      if (activeFilter === 'upcoming') {
        return !liveMatchIds.includes(match.id) && match.date >= now;
      }

      return true;
    });
  }, [activeFilter, liveMatchIds, matches]);

  const selectedPoster = buildPosterUrl(selectedMatch?.poster);
  const selectedBadgeHome = buildBadgeUrl(selectedMatch?.teams?.home?.badge);
  const selectedBadgeAway = buildBadgeUrl(selectedMatch?.teams?.away?.badge);

  return (
    <main className="shell">
      {showDisclaimer ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
            <p className="eyebrow">Important</p>
            <h1 id="disclaimer-title">HSN+ does not host streams</h1>
            <p>
              HSN+ only displays match information and external embeds from the API provider. Any playback
              happens on the external source, not on this site.
            </p>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                window.localStorage.setItem(DISCLAIMER_KEY, 'acknowledged');
              }}
            >
              I Understand
            </button>
          </section>
        </div>
      ) : null}

      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <section className="hero-card">
        <div className="hero-brand hero-brand-centered">
          <p className="brand-mark">HSN+</p>
          <h1>Football and Formula 1 embeds.</h1>
          <div className="hero-note" aria-label="Feed summary">
            <span>{sports.length || '—'} sports</span>
            <span>{matches.length || '—'} matches</span>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="feed-column">
          <div className="section-header">
            <div>
              <p className="eyebrow">Browse</p>
              <h2>Curated live feed</h2>
            </div>
          </div>

          <div className="filter-bar" role="tablist" aria-label="Match selectors">
            {[
              ['all', 'All'],
              ['football', 'Football'],
              ['formula1', 'Formula 1'],
              ['live', 'Live'],
              ['upcoming', 'Upcoming']
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={activeFilter === key ? 'filter-chip active' : 'filter-chip'}
                onClick={() => setActiveFilter(key as FilterKey)}
              >
                {label}
              </button>
            ))}
          </div>

          {loadingFeed ? <div className="empty-card">Loading the feed from the external API.</div> : null}
          {error ? <div className="error-card">{error}</div> : null}

          <div className="match-list">
            {visibleMatches.map((match) => {
              const isSelected = selectedMatch?.id === match.id;
              const poster = buildPosterUrl(match.poster);
              const homeBadge = buildBadgeUrl(match.teams?.home?.badge);
              const awayBadge = buildBadgeUrl(match.teams?.away?.badge);
              const isLive = liveMatchIds.includes(match.id);

              return (
                <button
                  key={match.id}
                  type="button"
                  className={isSelected ? 'match-card selected' : 'match-card'}
                  onClick={() => {
                    setSelectedMatch(match);
                    setShowMatchModal(true);
                  }}
                >
                  <div className="match-visual">
                    {poster ? (
                      <img src={poster} alt={match.title} loading="lazy" />
                    ) : (
                      <div className="badge-row">
                        {homeBadge ? <img src={homeBadge} alt={match.teams?.home?.name ?? 'Home team'} /> : null}
                        <span>VS</span>
                        {awayBadge ? <img src={awayBadge} alt={match.teams?.away?.name ?? 'Away team'} /> : null}
                      </div>
                    )}
                    <span className={isLive ? 'status-pill live' : 'status-pill'}>
                      {isLive ? 'Live' : match.popular ? 'Popular' : 'Scheduled'}
                    </span>
                  </div>

                  <div className="match-copy">
                    <div className="match-title-row">
                      <h3>{match.title}</h3>
                    </div>

                    <p>{formatDate(match.date)}</p>

                    {match.teams?.home?.name || match.teams?.away?.name ? (
                      <div className="team-line">
                        {match.teams?.home?.name ? <span>{match.teams.home.name}</span> : null}
                        {match.teams?.away?.name ? <span>{match.teams.away.name}</span> : null}
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}

            {!loadingFeed && visibleMatches.length === 0 ? <div className="empty-card">No matches available right now.</div> : null}
          </div>
        </div>

        {/* Right-side embed removed — player now only appears in the modal */}
      </section>

      {showMatchModal && selectedMatch ? (
        <div className="modal-backdrop match-modal" role="presentation" onClick={() => setShowMatchModal(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="match-title" onClick={(e) => e.stopPropagation()}>
            <div className="section-header compact">
              <div>
                <p className="eyebrow">Match</p>
                <h1 id="match-title">{selectedMatch.title}</h1>
                <p className="hero-note">{formatDate(selectedMatch.date)}</p>
              </div>
              <div>
                <button type="button" className="primary-button" onClick={() => setShowMatchModal(false)}>Close</button>
              </div>
            </div>

            <div className="player-frame-wrap">
              {buildPosterUrl(selectedMatch.poster) ? (
                <img className="player-poster" src={buildPosterUrl(selectedMatch.poster) ?? undefined} alt={selectedMatch.title} />
              ) : null}

              <div className="iframe-shell">
                {loadingPlayer ? <div className="empty-card inset">Loading embed.</div> : null}
                {!loadingPlayer && !activeStream ? <div className="empty-card inset">Choose a source to load the player.</div> : null}
                {activeStream ? (
                  <iframe
                    title={selectedMatch.title}
                    src={activeStream.embedUrl}
                    allow="autoplay; fullscreen; picture-in-picture"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
              </div>
            </div>

            <div className="stream-pills" aria-label="Available streams">
              {streams.map((stream) => (
                <button
                  key={`${stream.source}-${stream.streamNo}-${stream.language}-${stream.id}`}
                  type="button"
                  className={activeStream?.id === stream.id ? 'stream-pill active' : 'stream-pill'}
                  onClick={() => setActiveStream(stream)}
                >
                  {stream.language} {stream.hd ? 'HD' : 'SD'}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
