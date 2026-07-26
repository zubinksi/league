import { useQueries } from '@tanstack/react-query';
import { fetchWeekStats, type WeekStats } from '../api/stats';

/** All weekly stat maps for weeks 1..throughWeek. Query keys match the rest
 *  of the app, so anything already fetched (polling, player cards) is shared. */
export function useWeeklyStatsAll(
  season: string | undefined,
  throughWeek: number,
  enabled: boolean,
): { weekly: (WeekStats | undefined)[]; loading: boolean } {
  const on = enabled && !!season && throughWeek >= 1;
  const weeks = on ? Array.from({ length: throughWeek }, (_, i) => i + 1) : [];
  const results = useQueries({
    queries: weeks.map((w) => ({
      queryKey: ['stats', season, w],
      queryFn: () => fetchWeekStats(season!, w),
      staleTime: w < throughWeek ? Infinity : 30_000,
      enabled: on,
    })),
  });
  return {
    weekly: results.map((r) => r.data),
    loading: on && results.some((r) => r.isLoading),
  };
}
