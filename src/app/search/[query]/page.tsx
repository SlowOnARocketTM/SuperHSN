'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  API_BASE,
  Match,
  buildPosterUrl,
  fetchJson,
  formatDate,
  formatDateShort,
  isRealFootballMatch,
  looksLikeFormulaOneMatch,
} from '@/lib/streamed';

function generateMatchImage(homeName: string, awayName: string, title: string) {
  const initials = (name: string) => {
    const words = name.trim().split(/\s+/);
    return words.length >= 2
      ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };
  const homeInit = homeName ? initials(homeName) : '?';
  const awayInit = awayName ? initials(awayName) : '?';

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

export default function SearchPage() {
  const router = useRouter();
  const params = useParams<{ query: string }>();
  const query = decodeURIComponent(params?.query ?? '');

  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMatches() {
      try {
        setLoading(true);
        setError(null);
        const allMatches = await fetchJson<Match[]>(
          `${API_BASE}/matches/all`,
          controller.signal
        );

        const curated = allMatches.filter(
          (m) => isRealFootballMatch(m) || looksLikeFormulaOneMatch(m)
        );

        setMatches(curated);
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name !== 'AbortError') {
          setError('Unable to load matches.');
        }
      } finally {
        setLoading(false);
      }
    }

    loadMatches();
    return () => controller.abort();
  }, []);

  const results = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return matches.filter((m) => {
      const title = m.title.toLowerCase();
      const home = m.teams?.home?.name?.toLowerCase() ?? '';
      const away = m.teams?.away?.name?.toLowerCase() ?? '';
      return title.includes(q) || home.includes(q) || away.includes(q);
    });
  }, [matches, query]);

  return (
    <main className="shell">
      <div className="match-topbar">
        <button type="button" className="back-button" onClick={() => router.back()}>
          ← Back
        </button>
        <div className="match-topbar-copy">
          <p className="eyebrow">Search</p>
          <h1>{query}</h1>
        </div>
      </div>

      <section className="content-grid">
        {loading ? (
          <div className="match-list">
            {Array.from({ length: 6 }).map((_, i) => (
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
        ) : error ? (
          <div className="error-card">{error}</div>
        ) : results.length === 0 ? (
          <div className="empty-card">
            {query
              ? `No results for "${query}".`
              : 'Enter a search term to find matches.'}
          </div>
        ) : (
          <div className="match-list">
            {results.map((match) => {
              const poster = buildPosterUrl(match.poster);
              const homeName = match.teams?.home?.name ?? '';
              const awayName = match.teams?.away?.name ?? '';
              const fallbackSrc = generateMatchImage(homeName, awayName, match.title);

              return (
                <div
                  key={match.id}
                  className="match-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/match/${match.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ')
                      router.push(`/match/${match.id}`);
                  }}
                >
                  <div className="match-visual">
                    {poster ? (
                      <img
                        src={poster}
                        alt={match.title}
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = fallbackSrc;
                        }}
                      />
                    ) : (
                      <img src={fallbackSrc} alt={match.title} loading="lazy" />
                    )}
                    <span className="status-pill">
                      {match.popular ? 'Popular' : formatDateShort(match.date)}
                    </span>
                  </div>
                  <div className="match-copy">
                    <div className="match-title-row">
                      <h3>{match.title}</h3>
                    </div>
                    <p>{formatDate(match.date)}</p>
                    {match.teams?.home?.name || match.teams?.away?.name ? (
                      <div className="team-line">
                        {match.teams?.home?.name ? (
                          <span>{match.teams.home.name}</span>
                        ) : null}
                        {match.teams?.away?.name ? (
                          <span>{match.teams.away.name}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
