'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import {
  API_BASE,
  Match,
  Sport,
  Stream,
  buildBadgeUrl,
  buildPosterUrl,
  fetchJson,
  formatDate,
  isFootballSport,
  isFormulaOneSport,
  isRealFootballMatch,
  looksLikeFormulaOneMatch,
  LigaMatch,
  fetchLigaMatches,
  getLigaScoreDisplay,
  getLigaScore,
  isLigaMatchLive,
  isLigaMatchFinished,
  fuzzyTeamMatch,
  LIGA_BL,
  LIGA_BL2,
  LIGA_DFB
} from '@/lib/streamed';

const DISCLAIMER_KEY = 'hsn-plus-disclaimer-acknowledged';

/* ── F1 OpenF1 types (free, no API key) ───────────────── */
type F1DriverInfo = {
  driver_number: number;
  full_name: string;
  team_name: string;
  team_colour?: string;
  name_acronym?: string;
};

type F1Position = {
  driver_number: number;
  position: number;
  date: string;
  session_key: number | string;
};

const TEAM_COLOURS: Record<string, string> = {
  'Red Bull Racing': '#3671C6',
  'Mercedes': '#27F4D2',
  'Ferrari': '#E8002D',
  'McLaren': '#FF8000',
  'Aston Martin': '#229971',
  'Alpine': '#0093CC',
  'Williams': '#64C4FF',
  'RB': '#6692FF',
  'Sauber': '#52E252',
  'Haas F1 Team': '#B6BABD',
  'Kick Sauber': '#52E252',
};

const OPENF1_BASE = 'https://api.openf1.org/v1';

async function fetchF1Positions(sessionKey: number | string = 'latest'): Promise<F1Position[]> {
  try {
    const response = await fetch(`${OPENF1_BASE}/position?session_key=${sessionKey}&position<=20`);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return [];
    // Group by driver, keep latest position per driver
    const latest = new Map<number, F1Position>();
    for (const pos of data) {
      if (pos.driver_number == null || pos.position == null) continue;
      const existing = latest.get(pos.driver_number);
      if (!existing || new Date(pos.date) > new Date(existing.date)) {
        latest.set(pos.driver_number, pos);
      }
    }
    return [...latest.values()].sort((a, b) => a.position - b.position);
  } catch {
    return [];
  }
}

async function fetchF1Drivers(sessionKey: number | string = 'latest'): Promise<F1DriverInfo[]> {
  try {
    const response = await fetch(`${OPENF1_BASE}/drivers?session_key=${sessionKey}`);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    const unique = new Map<number, F1DriverInfo>();
    for (const d of data) {
      if (d.driver_number == null) continue;
      if (!unique.has(d.driver_number)) {
        unique.set(d.driver_number, {
          driver_number: d.driver_number,
          full_name: d.full_name ?? `Driver #${d.driver_number}`,
          team_name: d.team_name ?? '',
          team_colour: d.team_colour,
          name_acronym: d.name_acronym,
        });
      }
    }
    return [...unique.values()];
  } catch {
    return [];
  }
}

type PageMatch = Match & {
  displayTag: string;
};

function getDisplayTag(match: Match) {
  if (looksLikeFormulaOneMatch(match)) return 'Formula 1';
  if (isRealFootballMatch(match)) return 'Football';
  return match.category;
}

export default function MatchPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const matchId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [sports, setSports] = useState<Sport[]>([]);
  const [match, setMatch] = useState<PageMatch | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // LigaDB scores
  const [ligaMatches, setLigaMatches] = useState<LigaMatch[]>([]);
  const [loadingScores, setLoadingScores] = useState(false);

  // F1 live tracker
  const [f1Positions, setF1Positions] = useState<F1Position[]>([]);
  const [f1Drivers, setF1Drivers] = useState<F1DriverInfo[]>([]);
  const [loadingF1, setLoadingF1] = useState(false);
  const [f1SessionLive, setF1SessionLive] = useState(false);

  useEffect(() => {
    setShowDisclaimer(window.localStorage.getItem(DISCLAIMER_KEY) !== 'acknowledged');
  }, []);

  useEffect(() => {
    if (!matchId) {
      setError('No match selected.');
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadMatch() {
      try {
        setLoading(true);
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

        const curatedMatches = allMatches
          .filter((item) => {
            return (
              allowedSportIds.has(item.category) ||
              isRealFootballMatch(item) ||
              looksLikeFormulaOneMatch(item)
            );
          })
          .sort((left, right) => {
            const leftLive = liveMatches.some((m) => m.id === left.id) ? 1 : 0;
            const rightLive = liveMatches.some((m) => m.id === right.id) ? 1 : 0;
            if (leftLive !== rightLive) return rightLive - leftLive;
            if (left.popular !== right.popular) return Number(right.popular) - Number(left.popular);
            return left.date - right.date;
          });

        setSports(sportsResponse);

        const selectedMatch = curatedMatches.find((item) => item.id === matchId) ?? null;

        if (!selectedMatch) {
          setError('Match not found.');
          setMatch(null);
          return;
        }

        setMatch({
          ...selectedMatch,
          displayTag: getDisplayTag(selectedMatch)
        });
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name !== 'AbortError') {
          setError('Unable to load the selected match right now.');
        }
      } finally {
        setLoading(false);
      }
    }

    loadMatch();

    return () => controller.abort();
  }, [matchId]);

  // Load ALL streams from ALL sources (not just the first one)
  useEffect(() => {
    if (!match) {
      setStreams([]);
      setActiveStream(null);
      return;
    }

    const controller = new AbortController();

    async function loadAllStreams() {
      try {
        setLoadingStreams(true);
        setError(null);

        const allStreams: Stream[] = [];

        // Fetch streams from ALL available sources
        for (const source of match!.sources) {
          try {
            const streamList = await fetchJson<Stream[]>(
              `${API_BASE}/stream/${source.source}/${source.id}`,
              controller.signal
            );
            allStreams.push(...streamList);
          } catch {
            // Individual source failure is non-fatal
          }
        }

        if (allStreams.length === 0) {
          throw new Error('No stream sources available.');
        }

        setStreams(allStreams);
        setActiveStream(allStreams[0] ?? null);
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name !== 'AbortError') {
          setStreams([]);
          setActiveStream(null);
          setError('Unable to load stream embeds for the selected match.');
        }
      } finally {
        setLoadingStreams(false);
      }
    }

    loadAllStreams();

    return () => controller.abort();
  }, [match]);

  // Fetch live scores for this match
  useEffect(() => {
    if (!match) return;

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

        // Filter to matches that might match this match
        const homeName = match!.teams?.home?.name ?? '';
        const awayName = match!.teams?.away?.name ?? '';
        const relevant = all.filter((liga) => {
          if (!homeName && !awayName) return false;
          return (
            fuzzyTeamMatch(liga.team1.teamName, homeName) ||
            fuzzyTeamMatch(liga.team1.teamName, awayName) ||
            fuzzyTeamMatch(liga.team2.teamName, homeName) ||
            fuzzyTeamMatch(liga.team2.teamName, awayName)
          );
        });

        setLigaMatches(relevant);
      } catch {
        // non-critical
      } finally {
        setLoadingScores(false);
      }
    }

    loadScores();
    return () => controller.abort();
  }, [match]);

  // Fetch F1 live positions for F1 matches
  useEffect(() => {
    if (!match || !looksLikeFormulaOneMatch(match)) return;

    const controller = new AbortController();
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function loadF1Data() {
      try {
        setLoadingF1(true);
        const [positions, drivers] = await Promise.all([
          fetchF1Positions('latest'),
          fetchF1Drivers('latest')
        ]);
        if (!controller.signal.aborted) {
          setF1Positions(positions);
          setF1Drivers(drivers);
          setF1SessionLive(positions.length > 0);
        }
      } catch {
        // non-critical
      } finally {
        if (!controller.signal.aborted) setLoadingF1(false);
      }
    }

    loadF1Data();
    // Refresh every 15 seconds if session is live
    intervalId = setInterval(() => {
      if (!controller.signal.aborted) loadF1Data();
    }, 15000);

    return () => {
      controller.abort();
      if (intervalId) clearInterval(intervalId);
    };
  }, [match]);

  const selectedPoster = buildPosterUrl(match?.poster);
  const selectedBadgeHome = buildBadgeUrl(match?.teams?.home?.badge);
  const selectedBadgeAway = buildBadgeUrl(match?.teams?.away?.badge);

  const heroTitle = useMemo(() => match?.title ?? 'Match', [match]);

  return (
    <main className="shell match-page-shell">
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

      <section className="match-topbar">
        <button type="button" className="back-button" onClick={() => router.back()}>
          ← Back
        </button>
        <div className="match-topbar-copy">
          <p className="eyebrow">Now Playing</p>
          <h1>{heroTitle}</h1>
        </div>
      </section>

      {loading ? <div className="empty-card">Loading match page.</div> : null}
      {error ? <div className="error-card">{error}</div> : null}

      {match ? (
        <section className="match-detail-grid">
          <div className="match-detail-card">
            <div className="match-detail-header">
              <div>
                <p className="eyebrow">{match.displayTag}</p>
                <h2>{match.title}</h2>
                <p>{formatDate(match.date)}</p>
              </div>
              <div className="mini-badges">
                {selectedBadgeHome ? <img src={selectedBadgeHome} alt="Home badge" /> : null}
                {selectedBadgeAway ? <img src={selectedBadgeAway} alt="Away badge" /> : null}
              </div>
            </div>

            <div className="match-player-shell">
              {selectedPoster ? <img className="player-poster" src={selectedPoster} alt={match.title} /> : null}

              <div className="iframe-shell">
                {loadingStreams ? <div className="empty-card inset">Loading embed.</div> : null}
                {!loadingStreams && !activeStream ? <div className="empty-card inset">No stream source available.</div> : null}
                {activeStream ? (
                  <iframe
                    title={match.title}
                    src={activeStream.embedUrl}
                    allow="autoplay; fullscreen; picture-in-picture"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
              </div>

              {/* ALL stream sources shown as selectable cards */}
              {streams.length > 0 ? (
                <div className="stream-pills" aria-label="Available streams">
                  {streams.map((stream) => (
                    <button
                      key={`${stream.source}-${stream.streamNo}-${stream.language}-${stream.id}`}
                      type="button"
                      className={activeStream?.id === stream.id ? 'stream-pill is-active' : 'stream-pill'}
                      onClick={() => setActiveStream(stream)}
                    >
                      <span>{stream.language} {stream.hd ? 'HD' : 'SD'}</span>
                      <small>{stream.source}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Live Score Panel from OpenLigaDB */}
            {ligaMatches.length > 0 ? (
              <div className="scoreboard-panel">
                <h4>📊 Live Scores</h4>
                {ligaMatches.map((liga) => {
                  const scoreDisplay = getLigaScoreDisplay(liga);
                  const scoreLive = isLigaMatchLive(liga);
                  const scoreFinished = isLigaMatchFinished(liga);

                  return (
                    <div key={liga.matchID} className="liga-match-row">
                      <span className="liga-team-name">{liga.team1.teamName}</span>
                      {scoreDisplay ? (
                        <span className={`liga-score ${scoreLive ? 'live' : ''}`}>{scoreDisplay}</span>
                      ) : (
                        <span className="liga-score">— : —</span>
                      )}
                      <span className="liga-team-name">{liga.team2.teamName}</span>
                      <span className="liga-status">
                        {scoreLive ? 'LIVE' : scoreFinished ? 'FT' : liga.group.groupName}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {loadingScores ? (
              <div className="scoreboard-panel">
                <h4>📊 Loading scores…</h4>
              </div>
            ) : null}
          </div>

          <aside className="match-side-card">
            <p className="eyebrow">Details</p>

            {match.teams?.home?.name || match.teams?.away?.name ? (
              <div className="team-line">
                {match.teams?.home?.name ? <span>{match.teams.home.name}</span> : null}
                {match.teams?.away?.name ? <span>{match.teams.away.name}</span> : null}
              </div>
            ) : null}

            <p className="match-side-note">
              <strong>Available sources:</strong> {match.sources.length}
            </p>

            <p className="match-side-note">
              <strong>Stream options:</strong> {streams.length}
              {streams.length > 0 && (
                <> — pick your preferred source above</>
              )}
            </p>

            <p className="match-side-note">
              Open this page on TV or mobile for a full-screen player.
            </p>

            {/* F1 Live Position Tracker */}
            {looksLikeFormulaOneMatch(match) ? (
              <div className="f1-tracker">
                <h4>
                  {f1SessionLive && <span className="f1-live-dot" />}
                  F1 Live Positions
                </h4>
                {loadingF1 && f1Positions.length === 0 ? (
                  <div className="f1-loading">Loading F1 data…</div>
                ) : f1Positions.length > 0 ? (
                  <div>
                    {f1Positions.slice(0, 20).map((pos) => {
                      const driver = f1Drivers.find(d => d.driver_number === pos.driver_number);
                      const teamColour = driver?.team_colour
                        ? `#${driver.team_colour}`
                        : TEAM_COLOURS[driver?.team_name ?? ''] ?? 'var(--text-dim)';
                      const posClass = pos.position <= 3 ? `p${pos.position}` : '';
                      return (
                        <div key={pos.driver_number} className="f1-position">
                          <span className={`f1-pos-num ${posClass}`}>
                            {pos.position}
                          </span>
                          <span
                            style={{
                              width: 3,
                              height: 20,
                              borderRadius: 999,
                              background: teamColour,
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div className="f1-driver-name">
                              {driver?.full_name ?? `#${pos.driver_number}`}
                            </div>
                            {driver?.team_name ? (
                              <div className="f1-driver-team">{driver.team_name}</div>
                            ) : null}
                          </div>
                          <span className="f1-gap">
                            {pos.position === 1 ? 'LEADER' : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="f1-loading">
                    {loadingF1 ? 'Connecting to live timing…' : 'No live F1 session data available.'}
                  </div>
                )}
              </div>
            ) : null}
          </aside>
        </section>
      ) : null}
    </main>
  );
}