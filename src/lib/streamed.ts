export type Sport = {
  id: string;
  name: string;
};

export type MatchSource = {
  source: string;
  id: string;
};

export type Team = {
  name?: string;
  badge?: string;
};

export type Match = {
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

export type Stream = {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
};

export const API_BASE = 'https://streamed.pk/api';

export function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function formatDateShort(timestamp: number) {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 0) return 'Upcoming';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return formatDate(timestamp);
}

export function buildPosterUrl(poster?: string) {
  if (!poster) return null;
  // Use original image without .webp for better quality
  return poster.startsWith('http') ? poster : `https://streamed.pk${poster}`;
}

export function buildBadgeUrl(badge?: string) {
  if (!badge) return null;
  // Use original image without .webp for better quality
  return `https://streamed.pk/api/images/badge/${badge}`;
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const json = await response.json();
  // API returns { value: [...] } format, unwrap it
  if (json && typeof json === 'object' && 'value' in json && Array.isArray(json.value)) {
    return json.value as T;
  }
  return json as T;
}

export function isFootballSport(sport: Sport) {
  const value = `${sport.id} ${sport.name}`.toLowerCase();
  // Exclude American football (NFL) — only soccer/real football
  return (value.includes('football') || value.includes('soccer')) && !value.includes('nfl');
}

export function isFormulaOneSport(sport: Sport) {
  const value = `${sport.id} ${sport.name}`.toLowerCase();
  return (
    value.includes('formula 1') ||
    value.includes('formula1') ||
    value === 'f1' ||
    value.includes(' f1 ')
  );
}

export function looksLikeFormulaOneMatch(match: Match) {
  return /formula\s*1|\bf1\b|grand prix|formula one/i.test(`${match.category} ${match.title}`);
}

export function isRealFootballMatch(match: Match) {
  const combined =
    `${match.category} ${match.title} ${match.teams?.home?.name ?? ''} ${match.teams?.away?.name ?? ''}`.toLowerCase();
  if (
    combined.includes('nfl') ||
    combined.includes('american football') ||
    combined.includes('super bowl')
  )
    return false;
  return (
    combined.includes('football') ||
    combined.includes('soccer') ||
    combined.includes('futbol') ||
    combined.includes('fútbol') ||
    combined.includes('association football')
  );
}

export function isAmericanFootballSport(sport: Sport) {
  const value = `${sport.id} ${sport.name}`.toLowerCase();
  return value.includes('american football') || (value.includes('football') && value.includes('nfl'));
}

export function isBasketballSport(sport: Sport) {
  const value = `${sport.id} ${sport.name}`.toLowerCase();
  return value.includes('basketball') || value.includes('nba');
}

export function looksLikeAmericanFootballMatch(match: Match) {
  const combined = `${match.category} ${match.title} ${match.teams?.home?.name ?? ''} ${match.teams?.away?.name ?? ''}`.toLowerCase();
  return combined.includes('nfl') || combined.includes('american football') || combined.includes('super bowl');
}

export function looksLikeBasketballMatch(match: Match) {
  const combined = `${match.category} ${match.title} ${match.teams?.home?.name ?? ''} ${match.teams?.away?.name ?? ''}`.toLowerCase();
  return combined.includes('basketball') || combined.includes('nba');
}

/* ── OpenLigaDB Live Scores (free, no key needed) ────────────────── */

const OPENLIGA_BASE = 'https://api.openligadb.de';

export type LigaMatch = {
  matchID: number;
  matchDateTime: string;
  group: { groupName: string };
  team1: { teamName: string; shortName: string; teamIconUrl?: string };
  team2: { teamName: string; shortName: string; teamIconUrl?: string };
  matchResults: Array<{
    resultID: number;
    resultTypeID: number;
    resultName: string;
    pointsTeam1: number;
    pointsTeam2: number;
  }>;
  matchStatus: { matchStatusID: number; name: string };
  lastUpdateDateTime: string;
};

export type LigaTeam = {
  teamName: string;
  shortName: string;
  teamIconUrl?: string;
};

// Leagues available via OpenLigaDB
export const LIGA_BL = 'bl1';    // Bundesliga 1
export const LIGA_BL2 = 'bl2';   // Bundesliga 2
export const LIGA_BL3 = 'bl3';   // 3. Liga
export const LIGA_DFB = 'dfb';   // DFB Pokal
export const LIGA_UCL = 'ucl';   // Champions League
export const LIGA_UEL = 'uel';   // Europa League

export const LIGA_LEAGUES = [LIGA_BL, LIGA_BL2, LIGA_BL3, LIGA_DFB, LIGA_UCL, LIGA_UEL];

export async function fetchLigaMatches(
  league: string,
  season?: number,
  signal?: AbortSignal
): Promise<LigaMatch[]> {
  const year = season ?? new Date().getFullYear();
  const url = `${OPENLIGA_BASE}/getmatchdata/${league}/${year}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Liga request failed: ${response.status}`);
  return response.json() as Promise<LigaMatch[]>;
}

export function getLigaScore(match: LigaMatch, side: 1 | 2): number | null {
  const result = match.matchResults.find((r) => r.resultTypeID === 2); // final score
  if (!result) return null;
  return side === 1 ? result.pointsTeam1 : result.pointsTeam2;
}

export function getLigaScoreDisplay(match: LigaMatch): string | null {
  const result = match.matchResults.find((r) => r.resultTypeID === 2);
  if (!result) return null;
  return `${result.pointsTeam1} : ${result.pointsTeam2}`;
}

export function isLigaMatchLive(match: LigaMatch): boolean {
  return match.matchStatus.matchStatusID === 3; // statusID 3 = running
}

export function isLigaMatchFinished(match: LigaMatch): boolean {
  return match.matchStatus.matchStatusID === 5; // statusID 5 = finished
}

/* ── SportSRC Standings (free, no key needed) ────────────── */

const SPORTSRC_BASE = 'https://api.sportsrc.org';

export type StandingTeam = {
  position: number;
  team: { id: number; name: string; shortName: string; tla: string; crest: string };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

export type LeagueStandings = {
  name: string;
  code: string;
  emblem: string;
  season: { startDate: string; endDate: string; currentMatchday: number };
  table: StandingTeam[];
};

export const STANDINGS_LEAGUES = [
  { code: 'PL', name: 'Premier League' },
  { code: 'BL1', name: 'Bundesliga' },
  { code: 'SA', name: 'Serie A' },
  { code: 'PD', name: 'La Liga' },
] as const;

export async function fetchStandings(league: string): Promise<LeagueStandings | null> {
  try {
    const response = await fetch(
      `${SPORTSRC_BASE}/?data=results&category=tables&league=${league}`
    );
    if (!response.ok) return null;
    const json = await response.json();
    if (!json?.success || !json?.data?.standings?.[0]?.table) return null;
    const comp = json.data.competition;
    const season = json.data.season;
    return {
      name: comp.name,
      code: comp.code,
      emblem: comp.emblem,
      season,
      table: json.data.standings[0].table,
    };
  } catch {
    return null;
  }
}

// Simple fuzzy match to link streamed matches with live scores
export function fuzzyTeamMatch(leagueName: string, apiName: string): boolean {
  const a = leagueName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = apiName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return a.includes(b) || b.includes(a);
}
