'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import {
  API_BASE,
  Match,
  Sport,
  buildBadgeUrl,
  buildPosterUrl,
  fetchJson,
  formatDate,
  formatDateShort,
  isFootballSport,
  isFormulaOneSport,
  isRealFootballMatch,
  looksLikeFormulaOneMatch,
  LigaMatch,
  fetchLigaMatches,
  getLigaScoreDisplay,
  isLigaMatchLive,
  isLigaMatchFinished,
  fuzzyTeamMatch,
  LIGA_BL,
  LIGA_BL2,
  LIGA_DFB
} from '@/lib/streamed';

const DISCLAIMER_KEY = 'hsn-plus-disclaimer-acknowledged';

type FilterKey = 'all' | 'football' | 'formula1' | 'live' | 'upcoming';

const SKELETON_COUNT = 6;

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sports, setSports] = useState<Sport[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [liveMatchIds, setLiveMatchIds] = useState<string[]>([]);
  const [ligaMatches, setLigaMatches] = useState<LigaMatch[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingScores, setLoadingScores] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // Read filter from URL query param
  const activeFilter = useMemo<FilterKey>(() => {
    const filter = searchParams.get('filter') as FilterKey | null;
    if (filter && ['all', 'football', 'formula1', 'live', 'upcoming'].includes(filter)) return filter;
    return 'all';
  }, [searchParams]);

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

  // Fetch live scores from OpenLigaDB
  useEffect(() => {
    const controller = new AbortController();

    async function loadScores() {
      try {
        setLoadingScores(true);
        const leagues = [LIGA_BL, LIGA_BL2, LIGA_DFB];
        const results = await Promise.allSettled(
          leagues.map((league) => fetchLigaMatches(league, undefined, controller.signal))
        );

        const all: LigaMatch[] = [];
        for (const result of results) {
          if (result.status === 'fulfilled') {
            all.push(...result.value);
          }
        }

        // Filter to only live/finished matches (skip far-future)
        const relevant = all.filter((m) => {
          const age = Date.now() - new Date(m.matchDateTime).getTime();
          return age > -86400000; // within last 24h or upcoming
        });

        setLigaMatches(relevant);
      } catch {
        // scores are non-critical
      } finally {
        setLoadingScores(false);
      }
    }

    loadScores();
    return () => controller.abort();
  }, []);

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

  // Fuzzy-match live scores to streamed matches
  const matchScoresMap = useMemo(() => {
    const map = new Map<string, LigaMatch>();

    for (const ligaMatch of ligaMatches) {
      const team1 = ligaMatch.team1.teamName;
      const team2 = ligaMatch.team2.teamName;

      for (const streamMatch of matches) {
        const homeName = streamMatch.teams?.home?.name ?? '';
        const awayName = streamMatch.teams?.away?.name ?? '';

        if (
          (fuzzyTeamMatch(team1, homeName) && fuzzyTeamMatch(team2, awayName)) ||
          (fuzzyTeamMatch(team1, awayName) && fuzzyTeamMatch(team2, homeName))
        ) {
          map.set(streamMatch.id, ligaMatch);
        }
      }
    }

    return map;
  }, [ligaMatches, matches]);

  const handleFilterChange = useCallback((filter: FilterKey) => {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('filter', filter);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : '/');
  }, [router]);

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
                setShowDisclaimer(false);
              }}
            >
              I Understand
            </button>
          </section>
        </div>
      ) : null}

      {/* Hero Section */}
      <section className="hero-card">
        <div className="hero-brand-centered">
          <div className="hero-logo">
            <div className="brand-mark">H+</div>
            <h1>HSN+</h1>
          </div>
          <p className="hero-subtitle">Football & Formula 1</p>
          <div className="hero-note" aria-label="Feed summary">
            <span>{sports.length || '—'} sports</span>
            <span>{matches.length || '—'} matches</span>
            {ligaMatches.filter((m) => isLigaMatchLive(m)).length > 0 && (
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>
                {ligaMatches.filter((m) => isLigaMatchLive(m)).length} live
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="feed-column">
          <div className="section-header">
            <div>
              <p className="eyebrow">Browse</p>
              <h2>Curated feed</h2>
            </div>
          </div>

          <div className="filter-bar" role="tablist" aria-label="Match filters">
            {[
              ['all', 'All'],
              ['football', '⚽ Football'],
              ['formula1', '🏎 Formula 1'],
              ['live', '🔴 Live'],
              ['upcoming', '📅 Upcoming']
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={activeFilter === key ? 'filter-chip is-active' : 'filter-chip'}
                onClick={() => handleFilterChange(key as FilterKey)}
              >
                {label}
              </button>
            ))}
          </div>

          {loadingFeed ? (
            <div className="match-list">
              {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton-media" />
                  <div className="skeleton-body">
                    <div className="skeleton-line" />
                    <div className="skeleton-line short" />
                    <div className="skeleton-line small" />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {error ? <div className="error-card">{error}</div> : null}

          <div className="match-list">
            {visibleMatches.map((match) => {
              const poster = buildPosterUrl(match.poster);
              const homeBadge = buildBadgeUrl(match.teams?.home?.badge);
              const awayBadge = buildBadgeUrl(match.teams?.away?.badge);
              const isLive = liveMatchIds.includes(match.id);
              const linkedScore = matchScoresMap.get(match.id);
              const scoreDisplay = linkedScore ? getLigaScoreDisplay(linkedScore) : null;
              const isScoreLive = linkedScore ? isLigaMatchLive(linkedScore) : false;
              const isScoreFinished = linkedScore ? isLigaMatchFinished(linkedScore) : false;

              return (
                <button
                  key={match.id}
                  type="button"
                  className="match-card"
                  onClick={() => {
                    router.push(`/match/${match.id}`);
                  }}
                >
                  <div className="match-visual">
                    {poster ? (
                      <img src={poster} alt={match.title} loading="lazy" />
                    ) : homeBadge && awayBadge ? (
                      <div className="badge-row">
                        <img src={homeBadge} alt={match.teams?.home?.name ?? 'Home'} />
                        <span>VS</span>
                        <img src={awayBadge} alt={match.teams?.away?.name ?? 'Away'} />
                      </div>
                    ) : (
                      <div className="badge-row">
                        {homeBadge ? <img src={homeBadge} alt={match.teams?.home?.name ?? 'Home'} /> : null}
                        <span>VS</span>
                        {awayBadge ? <img src={awayBadge} alt={match.teams?.away?.name ?? 'Away'} /> : null}
                      </div>
                    )}

                    <span className={`status-pill ${isLive ? 'live' : isScoreFinished ? 'finished' : ''}`}>
                      {isLive ? 'Live' : isScoreFinished ? 'Final' : match.popular ? 'Popular' : formatDateShort(match.date)}
                    </span>

                    {scoreDisplay ? (
                      <span className={`score-badge ${isScoreLive ? 'live-score' : ''}`}>
                        {scoreDisplay}
                      </span>
                    ) : null}
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
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="shell"><div className="empty-card">Loading…</div></div>}>
      <HomeContent />
    </Suspense>
  );
}
