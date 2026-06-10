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
    minute: '2-digit'
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
  return value.includes('football') || value.includes('soccer');
}

export function isFormulaOneSport(sport: Sport) {
  const value = `${sport.id} ${sport.name}`.toLowerCase();
  return value.includes('formula 1') || value.includes('formula1') || value === 'f1' || value.includes(' f1 ');
}

export function looksLikeFormulaOneMatch(match: Match) {
  return /formula\s*1|\bf1\b|grand prix|formula one/i.test(`${match.category} ${match.title}`);
}

export function isRealFootballMatch(match: Match) {
  const combined = `${match.category} ${match.title} ${match.teams?.home?.name ?? ''} ${match.teams?.away?.name ?? ''}`.toLowerCase();
  return (
    combined.includes('football') ||
    combined.includes('soccer') ||
    combined.includes('futbol') ||
    combined.includes('fútbol') ||
    combined.includes('association football')
  );
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

// Common German leagues — good proxy for football scores
export const LIGA_BL = 'bl1';    // Bundesliga 1
export const LIGA_BL2 = 'bl2';   // Bundesliga 2
export const LIGA_DFB = 'dfb';   // DFB Pokal
export const LIGA_CL = 'cl';     // Champions League (if available)

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
  const result = match.matchResults.find(r => r.resultTypeID === 2); // final score
  if (!result) return null;
  return side === 1 ? result.pointsTeam1 : result.pointsTeam2;
}

export function getLigaScoreDisplay(match: LigaMatch): string | null {
  const result = match.matchResults.find(r => r.resultTypeID === 2);
  if (!result) return null;
  return `${result.pointsTeam1} : ${result.pointsTeam2}`;
}

export function isLigaMatchLive(match: LigaMatch): boolean {
  return match.matchStatus.matchStatusID === 3; // statusID 3 = running
}

export function isLigaMatchFinished(match: LigaMatch): boolean {
  return match.matchStatus.matchStatusID === 5; // statusID 5 = finished
}

// Simple fuzzy match to link streamed matches with live scores
export function fuzzyTeamMatch(
  leagueName: string,
  apiName: string
): boolean {
  const a = leagueName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = apiName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return a.includes(b) || b.includes(a);
}