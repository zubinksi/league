import { useQueries } from '@tanstack/react-query';
import { fetchMatchups, type SleeperMatchupEntry } from '../api/sleeper';
import { LEAGUE_ID } from '../config';

/** Matchup entries for weeks 1..throughWeek. Query keys match useWeekData, so
 *  the week already on screen is shared rather than refetched. */
export function useSeasonMatchups(
  throughWeek: number,
  enabled: boolean,
): { weekly: (SleeperMatchupEntry[] | undefined)[]; loading: boolean } {
  const on = enabled && throughWeek >= 1;
  const weeks = on ? Array.from({ length: throughWeek }, (_, i) => i + 1) : [];
  const results = useQueries({
    queries: weeks.map((w) => ({
      queryKey: ['matchups', w],
      queryFn: () => fetchMatchups(LEAGUE_ID, w),
      staleTime: w < throughWeek ? Infinity : 60_000,
      enabled: on,
    })),
  });
  return {
    weekly: results.map((r) => r.data),
    loading: on && results.some((r) => r.isLoading),
  };
}
