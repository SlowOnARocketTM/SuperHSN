'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

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
  looksLikeFormulaOneMatch
} from '@/lib/streamed';

const DISCLAIMER_KEY = 'hsn-plus-disclaimer-acknowledged';

type PageMatch = Match & {
  displayTag: string;
};

function getDisplayTag(match: Match) {
  if (looksLikeFormulaOneMatch(match)) {
    return 'Formula 1';
  }

  if (isRealFootballMatch(match)) {
    return 'Football';
  }

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
        const liveIds = new Set(liveMatches.map((item) => item.id));

        const curatedMatches = allMatches
          .filter((item) => {
            return (
              allowedSportIds.has(item.category) ||
              isRealFootballMatch(item) ||
              looksLikeFormulaOneMatch(item)
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

  useEffect(() => {
    if (!match) {
      setStreams([]);
      setActiveStream(null);
      return;
    }

    const currentMatch = match;

    const controller = new AbortController();

    async function loadStreams() {
      try {
        setLoadingStreams(true);
        setError(null);

        const source = currentMatch.sources[0];

        if (!source) {
          throw new Error('No stream sources available.');
        }

        const streamList = await fetchJson<Stream[]>(
          `${API_BASE}/stream/${source.source}/${source.id}`,
          controller.signal
        );

        setStreams(streamList);
        setActiveStream(streamList[0] ?? null);
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

    loadStreams();

    return () => controller.abort();
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

      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <section className="match-topbar">
        <button type="button" className="back-button" onClick={() => router.back()}>
          Back
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
                {selectedBadgeHome ? <img src={selectedBadgeHome} alt="Home team badge" /> : null}
                {selectedBadgeAway ? <img src={selectedBadgeAway} alt="Away team badge" /> : null}
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
          </div>

          <aside className="match-side-card">
            <p className="eyebrow">Details</p>
            <div className="team-line">
              {match.teams?.home?.name ? <span>{match.teams.home.name}</span> : null}
              {match.teams?.away?.name ? <span>{match.teams.away.name}</span> : null}
            </div>
            <p className="match-side-note">Open this page on TV or mobile for a full-screen player and larger controls.</p>
            <p className="match-side-note">{sports.length} sports loaded from the API.</p>
          </aside>
        </section>
      ) : null}
    </main>
  );
}
