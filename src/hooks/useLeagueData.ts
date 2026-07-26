import { useQuery } from '@tanstack/react-query';
import { LEAGUE_ID, LIVE_POLL_MS } from '../config';
import {
  fetchLeague,
  fetchMatchups,
  fetchRosters,
  fetchState,
  fetchUsers,
  type SleeperLeague,
  type SleeperState,
} from '../api/sleeper';
import { fetchPlayers } from '../api/players';
import { fetchScoreboard } from '../api/espn';
import {
  fetchSeasonProjections,
  fetchSeasonStats,
  fetchWeekProjections,
  fetchWeekStats,
} from '../api/stats';

const DAY = 24 * 60 * 60 * 1000;

export function useLeague() {
  return useQuery({ queryKey: ['league'], queryFn: () => fetchLeague(LEAGUE_ID), staleTime: DAY });
}

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => fetchUsers(LEAGUE_ID), staleTime: DAY });
}

export function useRosters() {
  return useQuery({
    queryKey: ['rosters'],
    queryFn: () => fetchRosters(LEAGUE_ID),
    staleTime: 5 * 60 * 1000,
  });
}

export function useNflState() {
  return useQuery({ queryKey: ['nflState'], queryFn: fetchState, staleTime: 60 * 60 * 1000 });
}

export function usePlayers() {
  return useQuery({ queryKey: ['players'], queryFn: fetchPlayers, staleTime: DAY, gcTime: DAY });
}

/** Season point totals per player (refreshed hourly — totals move on game days). */
export function useSeasonTotals(season: string | undefined) {
  return useQuery({
    queryKey: ['seasonStats', season],
    queryFn: () => fetchSeasonStats(season!),
    enabled: !!season,
    staleTime: 60 * 60 * 1000,
  });
}

/** Season projections, used for their ADP fields (fixed after drafts — daily). */
export function useSeasonAdp(season: string | undefined) {
  return useQuery({
    queryKey: ['seasonAdp', season],
    queryFn: () => fetchSeasonProjections(season!),
    enabled: !!season,
    staleTime: DAY,
  });
}

/** The week to show by default: the league's current leg while in season,
 *  else the final played week of a completed season. */
export function defaultWeek(league: SleeperLeague | undefined, state: SleeperState | undefined): number {
  if (!league) return 1;
  const lastWeek = (league.settings.playoff_week_start ?? 15) + 2;
  if (league.status === 'complete') return Math.min(lastWeek, 18);
  const leg = league.settings.leg;
  if (leg && leg >= 1) return leg;
  if (state && state.season === league.season && state.week >= 1) return Math.min(state.week, 18);
  return 1;
}

/** Live-polled, week-scoped data. Polling drives all motion in the UI. */
export function useWeekData(season: string | undefined, week: number | undefined) {
  const enabled = !!season && !!week;

  const matchups = useQuery({
    queryKey: ['matchups', week],
    queryFn: () => fetchMatchups(LEAGUE_ID, week!),
    enabled,
    refetchInterval: LIVE_POLL_MS,
  });

  const scoreboard = useQuery({
    queryKey: ['scoreboard', season, week],
    queryFn: () => fetchScoreboard(season!, week!),
    enabled,
    refetchInterval: LIVE_POLL_MS,
  });

  const stats = useQuery({
    queryKey: ['stats', season, week],
    queryFn: () => fetchWeekStats(season!, week!),
    enabled,
    refetchInterval: LIVE_POLL_MS,
  });

  const projections = useQuery({
    queryKey: ['projections', season, week],
    queryFn: () => fetchWeekProjections(season!, week!),
    enabled,
    staleTime: 60 * 60 * 1000,
  });

  return { matchups, scoreboard, stats, projections };
}
