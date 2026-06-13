'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  LeagueStandings,
  StandingTeam,
  fetchStandings,
  STANDINGS_LEAGUES,
} from '@/lib/streamed';

const LEAGUE_OPTIONS = STANDINGS_LEAGUES.map((l) => l);

function StandingRow({ team }: { team: StandingTeam }) {
  const isCL = team.position <= 4;
  const isRelegation = team.position >= 17;

  return (
    <div
      className={`standing-row${isCL ? ' cl-zone' : ''}${isRelegation ? ' rel-zone' : ''}`}
    >
      <span className="standing-pos">{team.position}</span>
      <span className="standing-team">
        {team.team.crest ? (
          <img
            src={team.team.crest}
            alt=""
            className="standing-crest"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : null}
        {team.team.shortName || team.team.name}
      </span>
      <span className="standing-stat">{team.playedGames}</span>
      <span className="standing-stat">{team.won}</span>
      <span className="standing-stat">{team.draw}</span>
      <span className="standing-stat">{team.lost}</span>
      <span className="standing-stat">{team.goalsFor}</span>
      <span className="standing-stat">{team.goalsAgainst}</span>
      <span className="standing-stat">{team.goalDifference}</span>
      <span className="standing-pts">{team.points}</span>
    </div>
  );
}

export default function StandingsPage() {
  const router = useRouter();
  const [selectedLeague, setSelectedLeague] = useState(
    LEAGUE_OPTIONS[0].code
  );
  const [standings, setStandings] = useState<LeagueStandings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchStandings(selectedLeague);
        if (!data) {
          setError('Unable to load standings for this league.');
          return;
        }
        setStandings(data);
      } catch {
        setError('Unable to load standings.');
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [selectedLeague]);

  const leagueName =
    LEAGUE_OPTIONS.find((l) => l.code === selectedLeague)?.name ??
    selectedLeague;

  return (
    <main className="shell">
      <div className="match-topbar">
        <button type="button" className="back-button" onClick={() => router.back()}>
          ← Back
        </button>
        <div className="match-topbar-copy">
          <p className="eyebrow">Standings</p>
          <h1>{leagueName}</h1>
        </div>
      </div>

      <section className="content-grid">
        <div className="filter-bar" role="tablist" aria-label="League selector">
          {LEAGUE_OPTIONS.map((league) => (
            <button
              key={league.code}
              type="button"
              className={
                selectedLeague === league.code ? 'filter-chip is-active' : 'filter-chip'
              }
              onClick={() => setSelectedLeague(league.code)}
            >
              {league.name}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="empty-card">Loading standings…</div>
        ) : error ? (
          <div className="error-card">{error}</div>
        ) : standings ? (
          <div className="standings-table-wrapper">
            {standings.emblem ? (
              <div className="standings-header">
                <img src={standings.emblem} alt="" className="standings-emblem" />
                <div>
                  <h2>{standings.name}</h2>
                  <p className="standings-season">
                    {standings.season.startDate} – {standings.season.endDate}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="standing-table">
              <div className="standing-header">
                <span className="standing-pos">#</span>
                <span className="standing-team">Team</span>
                <span className="standing-stat">P</span>
                <span className="standing-stat">W</span>
                <span className="standing-stat">D</span>
                <span className="standing-stat">L</span>
                <span className="standing-stat">GF</span>
                <span className="standing-stat">GA</span>
                <span className="standing-stat">GD</span>
                <span className="standing-pts">Pts</span>
              </div>
              {standings.table.map((team) => (
                <StandingRow key={team.team.id} team={team} />
              ))}
            </div>

            <div className="standings-legend">
              <span className="legend-item cl">Top 4 — Champions League</span>
              <span className="legend-item rel">Bottom 2 — Relegation</span>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
