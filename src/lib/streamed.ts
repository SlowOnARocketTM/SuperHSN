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

export function buildPosterUrl(poster?: string) {
  if (!poster) {
    return null;
  }

  return poster.startsWith('http') ? poster : `https://streamed.pk${poster}.webp`;
}

export function buildBadgeUrl(badge?: string) {
  if (!badge) {
    return null;
  }

  return `https://streamed.pk/api/images/badge/${badge}.webp`;
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
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
