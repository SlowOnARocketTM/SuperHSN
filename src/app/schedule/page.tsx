'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  API_BASE,
  Match,
  fetchJson,
  formatDate,
  isRealFootballMatch,
  looksLikeFormulaOneMatch,
} from '@/lib/streamed';

type FilterKey = 'all' | 'football' | 'formula1';

function getDayLabel(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff <= 7) return 'This Week';
  return 'Later';
}

export default function SchedulePage() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        const [allMatches, liveMatches] = await Promise.all([
          fetchJson<Match[]>(`${API_BASE}/matches/all`, controller.signal),
          fetchJson<Match[]>(`${API_BASE}/matches/live`, controller.signal),
        ]);

        const curated = allMatches.filter(
          (m) => isRealFootballMatch(m) || looksLikeFormulaOneMatch(m)
        );

        setMatches(curated);
        setLiveIds(new Set(liveMatches.map((m) => m.id)));
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name !== 'AbortError') {
          setError('Unable to load schedule.');
        }
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  const grouped = useMemo(() => {
    const now = Date.now();

    const filtered = matches.filter((m) => {
      if (activeFilter === 'football') return isRealFootballMatch(m);
      if (activeFilter === 'formula1') return looksLikeFormulaOneMatch(m);
      return true;
    });

    const upcoming = filtered
      .filter((m) => m.date >= now - 3600000)
      .sort((a, b) => a.date - b.date);

    const groups = new Map<string, Match[]>();
    for (const match of upcoming) {
      const label = getDayLabel(match.date);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(match);
    }

    const order = ['Live', 'Today', 'Tomorrow', 'This Week', 'Later'];
    return order
      .filter((key) => groups.has(key))
      .map((key) => ({ label: key, matches: groups.get(key)! }));
  }, [matches, activeFilter]);

  const liveMatches = useMemo(() => {
    return matches
      .filter((m) => liveIds.has(m.id))
      .sort((a, b) => a.date - b.date);
  }, [matches, liveIds]);

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'football', label: '⚽ Football' },
    { key: 'formula1', label: '🏎 Formula 1' },
  ];

  return (
    <main className="shell">
      <div className="match-topbar">
        <button type="button" className="back-button" onClick={() => router.back()}>
          ← Back
        </button>
        <div className="match-topbar-copy">
          <p className="eyebrow">Schedule</p>
          <h1>Match Schedule</h1>
        </div>
      </div>

      <section className="content-grid">
        <div className="filter-bar" role="tablist" aria-label="Schedule filters">
          {filters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={activeFilter === key ? 'filter-chip is-active' : 'filter-chip'}
              onClick={() => setActiveFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="empty-card">Loading schedule…</div>
        ) : error ? (
          <div className="error-card">{error}</div>
        ) : (
          <>
            {liveMatches.length > 0 && (
              <div className="schedule-day-group">
                <h3 className="schedule-day-label" style={{ color: 'var(--red)' }}>
                  🔴 Live — {liveMatches.length}
                </h3>
                {liveMatches.map((match) => (
                  <div
                    key={match.id}
                    className="schedule-match-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/match/${match.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ')
                        router.push(`/match/${match.id}`);
                    }}
                  >
                    <span className="schedule-time">{formatDate(match.date)}</span>
                    <span className="schedule-sport">
                      {looksLikeFormulaOneMatch(match) ? 'F1' : '⚽'}
                    </span>
                    <span className="schedule-title">{match.title}</span>
                  </div>
                ))}
              </div>
            )}

            {grouped.map((group) => (
              <div key={group.label} className="schedule-day-group">
                <h3 className="schedule-day-label">{group.label}</h3>
                {group.matches.map((match) => (
                  <div
                    key={match.id}
                    className="schedule-match-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/match/${match.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ')
                        router.push(`/match/${match.id}`);
                    }}
                  >
                    <span className="schedule-time">{formatDate(match.date)}</span>
                    <span className="schedule-sport">
                      {looksLikeFormulaOneMatch(match) ? 'F1' : '⚽'}
                    </span>
                    <span className="schedule-title">{match.title}</span>
                    {match.teams?.home?.name || match.teams?.away?.name ? (
                      <span className="schedule-teams">
                        {match.teams.home?.name ?? ''} vs {match.teams.away?.name ?? ''}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}

            {grouped.length === 0 && liveMatches.length === 0 && (
              <div className="empty-card">No upcoming matches scheduled.</div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
