import { useQueries } from '@tanstack/react-query';
import { fetchScoreboard } from '../api/espn';
import { fetchWeekStats, projectedPoints, statLine } from '../api/stats';
import type { PlayerMeta } from '../api/players';

export interface GameLogEntry {
  week: number;
  /** `vs BUF` / `@ BUF`, `BYE`, or '' while loading. */
  opponent: string;
  points?: number;
  statLine: string;
  live: boolean;
  loaded: boolean;
}

export interface SeasonLog {
  entries: GameLogEntry[];
  total: number;
  average: number;
  high?: number;
  low?: number;
  playedWeeks: number;
  loading: boolean;
}

/**
 * Per-week stats + opponents for one player across the season so far.
 * Query keys match useWeekData's, so the current week shares the live-polled
 * cache; past weeks are immutable and cached for the session (scoreboards
 * additionally persist in localStorage).
 */
export function useSeasonLog(
  player: PlayerMeta | undefined,
  season: string | undefined,
  currentWeek: number,
  recValue: number,
): SeasonLog {
  const enabled = !!player && !!season;
  const weeks = enabled ? Array.from({ length: currentWeek }, (_, i) => i + 1) : [];

  const statsResults = useQueries({
    queries: weeks.map((w) => ({
      queryKey: ['stats', season, w],
      queryFn: () => fetchWeekStats(season!, w),
      staleTime: w < currentWeek ? Infinity : 30_000,
      enabled,
    })),
  });

  const sbResults = useQueries({
    queries: weeks.map((w) => ({
      queryKey: ['scoreboard', season, w],
      queryFn: () => fetchScoreboard(season!, w),
      staleTime: w < currentWeek ? Infinity : 30_000,
      enabled,
    })),
  });

  const entries: GameLogEntry[] = weeks.map((week, i) => {
    const stats = statsResults[i].data?.[player!.player_id];
    const sb = sbResults[i].data;
    const game = player!.team && sb ? sb[player!.team] : undefined;

    let opponent = '';
    if (sb) opponent = game ? `${game.home ? 'vs' : '@'} ${game.opponent}` : 'BYE';

    const started = game ? game.state !== 'pre' : week < currentWeek;
    return {
      week,
      opponent,
      points: started && stats ? projectedPoints(stats, recValue) : undefined,
      statLine: started ? statLine(player!.position, stats) : '',
      live: game?.state === 'live',
      loaded: !statsResults[i].isLoading,
    };
  });

  const played = entries.filter((e) => e.points !== undefined);
  const total = played.reduce((s, e) => s + (e.points ?? 0), 0);

  return {
    entries,
    total,
    average: played.length ? total / played.length : 0,
    high: played.length ? Math.max(...played.map((e) => e.points!)) : undefined,
    low: played.length ? Math.min(...played.map((e) => e.points!)) : undefined,
    playedWeeks: played.length,
    loading: statsResults.some((q) => q.isLoading),
  };
}
