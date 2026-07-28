import { getJSON } from './http';

const BASE = 'https://api.sleeper.app/v1';

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: 'pre_draft' | 'drafting' | 'in_season' | 'complete';
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: {
    leg?: number;
    playoff_week_start?: number;
    [k: string]: number | undefined;
  };
}

export interface SleeperUser {
  user_id: string;
  display_name: string;
  metadata?: { team_name?: string };
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  players: string[] | null;
  starters: string[] | null;
  metadata?: { streak?: string; record?: string } | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
    waiver_position?: number;
  };
}

export interface SleeperMatchupEntry {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  starters: string[];
  starters_points?: number[];
  players: string[];
  players_points: Record<string, number>;
}

export interface SleeperState {
  season: string;
  week: number;
  display_week: number;
  season_type: string;
}

export const fetchState = () => getJSON<SleeperState>(`${BASE}/state/nfl`);

export const fetchLeague = (leagueId: string) =>
  getJSON<SleeperLeague>(`${BASE}/league/${leagueId}`);

export const fetchUsers = (leagueId: string) =>
  getJSON<SleeperUser[]>(`${BASE}/league/${leagueId}/users`);

export const fetchRosters = (leagueId: string) =>
  getJSON<SleeperRoster[]>(`${BASE}/league/${leagueId}/rosters`);

export const fetchMatchups = (leagueId: string, week: number) =>
  getJSON<SleeperMatchupEntry[]>(`${BASE}/league/${leagueId}/matchups/${week}`);

export interface TrendingPlayer {
  player_id: string;
  count: number;
}

export const fetchTrending = (type: 'add' | 'drop', limit = 30) =>
  getJSON<TrendingPlayer[]>(`${BASE}/players/nfl/trending/${type}?lookback_hours=24&limit=${limit}`);

/** Team label per the design: user metadata.team_name, else display name, uppercased. */
export function teamLabel(user: SleeperUser | undefined, rosterId: number): string {
  const name = user?.metadata?.team_name || user?.display_name || `TEAM ${rosterId}`;
  return name.toUpperCase();
}

export function rosterPoints(r: SleeperRoster): { pf: number; pa: number } {
  const s = r.settings;
  return {
    pf: (s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100,
    pa: (s.fpts_against ?? 0) + (s.fpts_against_decimal ?? 0) / 100,
  };
}
