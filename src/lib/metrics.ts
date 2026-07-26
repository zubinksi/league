import type { PlayerMap, PlayerMeta } from '../api/players';
import type { StatMap, WeekStats } from '../api/stats';
import { projectedPoints } from '../api/stats';
import type { ScoreboardMap } from '../api/espn';

/**
 * Advanced metrics derived entirely from data the app already fetches:
 * the per-week stat maps (all players) plus player metadata. Everything is
 * scored with the league's own reception value, so ranks and tiers describe
 * THIS league, not generic PPR.
 */

const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);

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

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface PlayerMetrics {
  gamesPlayed: number;
  seasonAvg: number;
  floor: number;
  ceiling: number;
  boomRate: number; // 0..1, weeks ≥ 1.2× season avg
  bustRate: number; // 0..1, weeks ≤ 0.5× season avg
  l4Avg?: number;
  tier1Weeks: number; // positional finishes 1–12
  tier2Weeks: number; // positional finishes 13–24
  seasonPosRank?: number;
  catchRate?: number;
  targetShare?: number;
  carryShare?: number;
  snapShare?: number; // opportunistic: needs off_snp / tm_off_snp keys
}

export interface PlayedWeek {
  points: number;
  posRank?: number;
  /** The full stats map for that week (all players). */
  all: WeekStats;
}

export function computeMetrics(args: {
  meta: PlayerMeta;
  players: PlayerMap;
  recValue: number;
  weeks: PlayedWeek[];
  seasonTotals?: WeekStats;
}): PlayerMetrics | null {
  const { meta, players, recValue, weeks, seasonTotals } = args;
  const gp = weeks.length;
  if (gp === 0) return null;

  const pts = weeks.map((w) => w.points);
  const seasonAvg = pts.reduce((a, b) => a + b, 0) / gp;
  const sorted = [...pts].sort((a, b) => a - b);

  const metrics: PlayerMetrics = {
    gamesPlayed: gp,
    seasonAvg,
    floor: quantile(sorted, 0.25),
    ceiling: quantile(sorted, 0.75),
    boomRate: seasonAvg > 0 ? pts.filter((p) => p >= 1.2 * seasonAvg).length / gp : 0,
    bustRate: seasonAvg > 0 ? pts.filter((p) => p <= 0.5 * seasonAvg).length / gp : 0,
    tier1Weeks: weeks.filter((w) => w.posRank !== undefined && w.posRank <= 12).length,
    tier2Weeks: weeks.filter((w) => w.posRank !== undefined && w.posRank > 12 && w.posRank <= 24).length,
  };

  if (gp >= 2) {
    const l4 = pts.slice(-4);
    metrics.l4Avg = l4.reduce((a, b) => a + b, 0) / l4.length;
  }

  metrics.seasonPosRank = positionRank(seasonTotals, players, meta.player_id, recValue);

  const pos = meta.position;
  if (!pos || !SKILL.has(pos)) return metrics;

  // Volume + efficiency from the player's own weekly categories.
  const own = weeks.map((w) => w.all[meta.player_id] ?? ({} as StatMap));
  const sum = (key: string) => own.reduce((a, s) => a + (s[key] ?? 0), 0);

  const rushAtt = sum('rush_att');
  const targets = sum('rec_tgt');
  const receptions = sum('rec');
  if (pos !== 'QB' && targets > 0) metrics.catchRate = receptions / targets;

  // Share of the NFL team's targets/carries, summed over this player's played
  // weeks. Uses each player's current team, so mid-season trades wobble it
  // slightly — acceptable for a card-level signal.
  if (pos !== 'QB' && meta.team) {
    let teamTargets = 0;
    let teamCarries = 0;
    for (const w of weeks) {
      for (const [id, s] of Object.entries(w.all)) {
        if (players[id]?.team !== meta.team) continue;
        teamTargets += s.rec_tgt ?? 0;
        teamCarries += s.rush_att ?? 0;
      }
    }
    if (teamTargets > 0 && targets > 0) metrics.targetShare = targets / teamTargets;
    if (teamCarries > 0 && rushAtt > 0) metrics.carryShare = rushAtt / teamCarries;
  }

  // Tier 2 — only when Sleeper's payload actually carries the keys.
  const snaps = sum('off_snp');
  const teamSnaps = sum('tm_off_snp');
  if (snaps > 0 && teamSnaps > 0) metrics.snapShare = snaps / teamSnaps;

  return metrics;
}

/**
 * Fantasy points allowed by each NFL defense to each position, accumulated
 * across the season's weeks. rank 1 = allows the MOST (softest matchup).
 */
export interface PointsAllowed {
  rank(team: string, pos: string): { rank: number; teams: number } | undefined;
}

export function computePointsAllowed(
  weeklyStats: (WeekStats | undefined)[],
  weeklyScoreboards: (ScoreboardMap | undefined)[],
  players: PlayerMap,
  recValue: number,
): PointsAllowed {
  const totals = new Map<string, Map<string, number>>(); // defense → pos → pts

  for (let i = 0; i < weeklyStats.length; i++) {
    const stats = weeklyStats[i];
    const sb = weeklyScoreboards[i];
    if (!stats || !sb) continue;
    for (const [id, s] of Object.entries(stats)) {
      const p = players[id];
      if (!p?.team || !p.position || !SKILL.has(p.position)) continue;
      const game = sb[p.team];
      if (!game || game.state === 'pre') continue;
      const v = projectedPoints(s, recValue);
      if (v === undefined) continue;
      const perPos = totals.get(game.opponent) ?? new Map<string, number>();
      perPos.set(p.position, (perPos.get(p.position) ?? 0) + v);
      totals.set(game.opponent, perPos);
    }
  }

  // Pre-rank each position: defenses sorted by points allowed, descending.
  const ranks = new Map<string, { rank: number; teams: number }>();
  for (const pos of SKILL) {
    const rows = [...totals.entries()]
      .map(([team, perPos]) => ({ team, pts: perPos.get(pos) ?? 0 }))
      .filter((r) => r.pts > 0)
      .sort((a, b) => b.pts - a.pts);
    rows.forEach((r, i) => ranks.set(`${r.team}:${pos}`, { rank: i + 1, teams: rows.length }));
  }

  return { rank: (team, pos) => ranks.get(`${team}:${pos}`) };
}
