'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  API_BASE,
  Match,
  Sport,
  buildBadgeUrl,
  buildPosterUrl,
  fetchJson,
  formatDate,
  isFootballSport,
  isFormulaOneSport,
  isRealFootballMatch,
  looksLikeFormulaOneMatch
} from '@/lib/streamed';

const DISCLAIMER_KEY = 'hsn-plus-disclaimer-acknowledged';

type FilterKey = 'all' | 'football' | 'formula1' | 'live' | 'upcoming';

export default function Home() {
  const router = useRouter();
  const [sports, setSports] = useState<Sport[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [liveMatchIds, setLiveMatchIds] = useState<string[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

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
              const poster = buildPosterUrl(match.poster);
              const homeBadge = buildBadgeUrl(match.teams?.home?.badge);
              const awayBadge = buildBadgeUrl(match.teams?.away?.badge);
              const isLive = liveMatchIds.includes(match.id);

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

      </section>
    </main>
  );
}
