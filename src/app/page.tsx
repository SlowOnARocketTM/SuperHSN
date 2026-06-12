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
const PREDICTIONS_KEY = 'hsn-plus-predictions';

type FilterKey = 'all' | 'football' | 'formula1' | 'live' | 'upcoming';

const SKELETON_COUNT = 6;

/* ── Predictions ─────────────────────────────────────── */
type Prediction = { home: number; away: number; ts: number };

function loadPredictions(): Record<string, Prediction> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(PREDICTIONS_KEY) || '{}');
  } catch { return {}; }
}

function savePrediction(matchId: string, home: number, away: number) {
  const preds = loadPredictions();
  preds[matchId] = { home, away, ts: Date.now() };
  localStorage.setItem(PREDICTIONS_KEY, JSON.stringify(preds));
}

function getPrediction(matchId: string): Prediction | null {
  return loadPredictions()[matchId] ?? null;
}

function getPredictionStats(predictions: Record<string, Prediction>, scoresMap: Map<string, LigaMatch>) {
  let correct = 0;
  let total = 0;
  for (const [matchId, pred] of Object.entries(predictions)) {
    const liga = scoresMap.get(matchId);
    if (!liga || !isLigaMatchFinished(liga)) continue;
    total++;
    const actualHome = liga.matchResults?.[0]?.pointsTeam1 ?? liga.matchResults?.[1]?.pointsTeam1;
    const actualAway = liga.matchResults?.[0]?.pointsTeam2 ?? liga.matchResults?.[1]?.pointsTeam2;
    if (actualHome != null && actualAway != null) {
      if (pred.home === actualHome && pred.away === actualAway) correct++;
    }
  }
  return { correct, total, pct: total > 0 ? Math.round((correct / total) * 100) : 0 };
}

/* Generate a gradient SVG match card when images fail to load */
function generateMatchImage(homeName: string, awayName: string, title: string) {
  const initials = (name: string) => {
    const words = name.trim().split(/\s+/);
    return words.length >= 2
      ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };
  const homeInit = homeName ? initials(homeName) : '?';
  const awayInit = awayName ? initials(awayName) : '?';

  // Deterministic gradient based on team names
  const hash = (s: string) => [...s].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const h1 = Math.abs(hash(homeName || title)) % 40 + 200;
  const h2 = Math.abs(hash(awayName || title)) % 40 + 340;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${h1},40%,8%)"/>
      <stop offset="100%" stop-color="hsl(${h2},35%,12%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%">
      <stop offset="0%" stop-color="hsl(356,95%,52%)" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <rect width="640" height="360" fill="url(#glow)"/>
  <text x="200" y="170" text-anchor="middle" font-family="Outfit,sans-serif" font-size="64" font-weight="800" fill="rgba(255,255,255,0.9)">${homeInit}</text>
  <text x="320" y="165" text-anchor="middle" font-family="Outfit,sans-serif" font-size="28" font-weight="700" fill="hsl(356,95%,52%)">VS</text>
  <text x="440" y="170" text-anchor="middle" font-family="Outfit,sans-serif" font-size="64" font-weight="800" fill="rgba(255,255,255,0.9)">${awayInit}</text>
  <text x="200" y="220" text-anchor="middle" font-family="Outfit,sans-serif" font-size="16" font-weight="500" fill="rgba(255,255,255,0.5)">${homeName || 'TBD'}</text>
  <text x="440" y="220" text-anchor="middle" font-family="Outfit,sans-serif" font-size="16" font-weight="500" fill="rgba(255,255,255,0.5)">${awayName || 'TBD'}</text>
  <line x1="260" y1="130" x2="260" y2="210" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  <line x1="380" y1="130" x2="380" y2="210" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

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

  // Predictions
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [predModal, setPredModal] = useState<{ matchId: string; homeName: string; awayName: string } | null>(null);
  const [predHome, setPredHome] = useState('0');
  const [predAway, setPredAway] = useState('0');

  useEffect(() => {
    setPredictions(loadPredictions());
  }, []);

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

  const predStats = useMemo(() => getPredictionStats(predictions, matchScoresMap), [predictions, matchScoresMap]);

  function openPredModal(e: React.MouseEvent, matchId: string, homeName: string, awayName: string) {
    e.stopPropagation();
    const existing = predictions[matchId];
    setPredHome(existing ? String(existing.home) : '0');
    setPredAway(existing ? String(existing.away) : '0');
    setPredModal({ matchId, homeName, awayName });
  }

  function submitPrediction() {
    if (!predModal) return;
    const h = parseInt(predHome, 10) || 0;
    const a = parseInt(predAway, 10) || 0;
    savePrediction(predModal.matchId, h, a);
    setPredictions(loadPredictions());
    setPredModal(null);
  }

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

      {/* Prediction Modal */}
      {predModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPredModal(null)}>
          <section className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">Your Prediction</p>
            <h1 style={{ fontSize: '1.3rem' }}>{predModal.homeName} vs {predModal.awayName}</h1>
            <div className="pred-input-row">
              <div className="pred-input-group">
                <label>{predModal.homeName}</label>
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={predHome}
                  onChange={(e) => setPredHome(e.target.value)}
                  className="pred-input"
                />
              </div>
              <span className="pred-vs">—</span>
              <div className="pred-input-group">
                <label>{predModal.awayName}</label>
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={predAway}
                  onChange={(e) => setPredAway(e.target.value)}
                  className="pred-input"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button type="button" className="ghost-button" onClick={() => setPredModal(null)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={submitPrediction}>
                Save Prediction
              </button>
            </div>
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

          {/* Prediction Stats */}
          {predStats.total > 0 ? (
            <div className="pred-stats-shelf">
              <div className="pred-stat">
                <span className="pred-stat-num">{predStats.total}</span>
                <span className="pred-stat-label">Predicted</span>
              </div>
              <div className="pred-stat">
                <span className="pred-stat-num">{predStats.correct}</span>
                <span className="pred-stat-label">Correct</span>
              </div>
              <div className="pred-stat">
                <span className="pred-stat-num pred-stat-pct">{predStats.pct}%</span>
                <span className="pred-stat-label">Accuracy</span>
              </div>
            </div>
          ) : null}

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

              const homeName = match.teams?.home?.name ?? '';
              const awayName = match.teams?.away?.name ?? '';
              const fallbackSrc = generateMatchImage(homeName, awayName, match.title);

              return (
                <div
                  key={match.id}
                  className="match-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    router.push(`/match/${match.id}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') router.push(`/match/${match.id}`);
                  }}
                >
                  <div className="match-visual">
                    {poster ? (
                      <img
                        src={poster}
                        alt={match.title}
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).src = fallbackSrc; }}
                      />
                    ) : homeBadge && awayBadge ? (
                      <img
                        src={fallbackSrc}
                        alt={match.title}
                        loading="lazy"
                      />
                    ) : (
                      <img
                        src={fallbackSrc}
                        alt={match.title}
                        loading="lazy"
                      />
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

                    {/* Prediction display */}
                    {predictions[match.id] && isScoreFinished ? (
                      (() => {
                        const pred = predictions[match.id];
                        const liga = matchScoresMap.get(match.id);
                        const actualH = liga?.matchResults?.[0]?.pointsTeam1 ?? liga?.matchResults?.[1]?.pointsTeam1;
                        const actualA = liga?.matchResults?.[0]?.pointsTeam2 ?? liga?.matchResults?.[1]?.pointsTeam2;
                        const correct = actualH != null && actualA != null && pred.home === actualH && pred.away === actualA;
                        return (
                          <div className="pred-result">
                            <span className={correct ? 'pred-correct' : 'pred-wrong'}>
                              {correct ? '✅ Correct!' : '❌ Wrong'}
                            </span>
                            <span className="pred-scores">
                              Yours: {pred.home}-{pred.away}
                              {actualH != null ? ` | Actual: ${actualH}-${actualA}` : ''}
                            </span>
                          </div>
                        );
                      })()
                    ) : predictions[match.id] ? (
                      <div className="pred-badge">
                        Your pick: {predictions[match.id].home}-{predictions[match.id].away}
                      </div>
                    ) : null}
                  </div>

                  {/* Predict button */}
                  {!isScoreFinished && !isLive ? (
                    <div className="match-pred-footer" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="predict-btn"
                        onClick={(e) => openPredModal(e, match.id, homeName, awayName)}
                      >
                        {predictions[match.id] ? '✏️ Change' : '🎯 Predict'}
                      </button>
                    </div>
                  ) : null}
                </div>
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
