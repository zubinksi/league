import type { PlayerMap } from '../api/players';
import type { WeekStats } from '../api/stats';
import { projectedPoints } from '../api/stats';

/**
 * Ranking helpers over data the app already fetches — per-week stat maps plus
 * player metadata — scored with the league's own reception value, so a rank
 * describes THIS league rather than generic PPR.
 *
 * The start/sit metrics that used to live here (boom and bust rates, tier
 * weeks, target and snap share, points allowed by defence) went with the
 * player card that showed them: there is no lineup to set, so nothing asked
 * the question they answered.
 */

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}TH`;
  const suffix = ['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH';
  return `${n}${['ST', 'ND', 'RD'].includes(suffix) ? suffix : 'TH'}`;
}

/** Rank of a player's fantasy points within their position for one stats map
 *  (weekly or season-aggregate). 1 = best. */
export function positionRank(
  stats: WeekStats | undefined,
  players: PlayerMap,
  playerId: string,
  recValue: number,
): number | undefined {
  if (!stats) return undefined;
  const pos = players[playerId]?.position;
  const mine = projectedPoints(stats[playerId], recValue);
  if (mine === undefined || !pos) return undefined;
  let above = 0;
  for (const [id, s] of Object.entries(stats)) {
    if (id === playerId || players[id]?.position !== pos) continue;
    const v = projectedPoints(s, recValue);
    if (v !== undefined && v > mine) above++;
  }
  return above + 1;
}

/** Every player's rank within their own position, in one pass. Cheaper than
 *  calling positionRank per player when a whole roster needs ranking. */
export function positionRanks(
  stats: WeekStats | undefined,
  players: PlayerMap,
  recValue: number,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!stats) return out;
  const byPos = new Map<string, { id: string; pts: number }[]>();
  for (const [id, s] of Object.entries(stats)) {
    const pos = players[id]?.position;
    const pts = projectedPoints(s, recValue);
    if (!pos || pts === undefined) continue;
    const list = byPos.get(pos);
    if (list) list.push({ id, pts });
    else byPos.set(pos, [{ id, pts }]);
  }
  for (const list of byPos.values()) {
    list.sort((a, b) => b.pts - a.pts);
    list.forEach((e, i) => out.set(e.id, i + 1));
  }
  return out;
}

/** Rank of a player's fantasy points across ALL positions (1 = best). */
export function overallRank(
  stats: WeekStats | undefined,
  playerId: string,
  recValue: number,
): number | undefined {
  if (!stats) return undefined;
  const mine = projectedPoints(stats[playerId], recValue);
  if (mine === undefined) return undefined;
  let above = 0;
  for (const [id, s] of Object.entries(stats)) {
    if (id === playerId) continue;
    const v = projectedPoints(s, recValue);
    if (v !== undefined && v > mine) above++;
  }
  return above + 1;
}
