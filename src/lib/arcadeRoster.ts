import type { PlayerMap } from '../api/players';
import { playerShortName } from '../api/players';
import type { WeekStats, StatMap } from '../api/stats';

/**
 * Turns a real roster into arcade characters — three ratings in 0..1 each.
 *
 * Ratings come from counting stats that only ever accumulate, so a player
 * climbs through named tiers across the season and never slides back. Rate
 * stats were the obvious choice and the wrong one: an average moves less and
 * less as the sample grows, so ratings went flat exactly when a season should
 * feel like it is going somewhere.
 *
 * Nobody starts at zero, because some players are simply better than others in
 * week one. Last season's totals carry over at a discount — enough to set a
 * starting tier, not so much that there is nothing left to climb.
 *
 * A tier sets the band and progress within it interpolates, so the ladder is
 * legible without every player at a tier sharing one identical number.
 */

export interface ArcadePlayer {
  name: string;
  team: string;
  a: number;
  b: number;
  c: number;
  /** Tier index 0..4 per attribute; the game holds the names. */
  ta: number;
  tb: number;
  tc: number;
  /** 1 when any attribute gained a tier in the last few weeks. */
  trend: number;
}

/** How much of last season carries in. Sets a floor without capping the climb. */
const PRIOR_WEIGHT = 0.4;
/** Weeks dropped to decide whether a tier was gained recently. */
const TREND_LOOKBACK = 3;
const TIERS = 5;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const norm = (v: number | undefined, lo: number, hi: number, fallback = 0.5): number => {
  if (v === undefined || !Number.isFinite(v)) return fallback;
  return clamp01((v - lo) / (hi - lo));
};

/** Cumulative stat → tier plus a value that keeps climbing inside the tier. */
function ladder(value: number, steps: number[]): { tier: number; value: number } {
  let i = 0;
  while (i + 1 < steps.length && value >= steps[i + 1]) i++;
  const lo = steps[i];
  const hi = steps[i + 1] ?? lo * 1.3 + 1;
  const frac = hi > lo ? Math.min(1, Math.max(0, (value - lo) / (hi - lo))) : 1;
  return { tier: i, value: Math.min(0.98, ((i + frac) / TIERS)) };
}

const num = (v: number | undefined) => (Number.isFinite(v) ? (v as number) : 0);

/** Sum of every week so far. Monotonic by construction. */
function cumulative(id: string, weekly: (WeekStats | undefined)[]): StatMap {
  const out: StatMap = {};
  for (const w of weekly) {
    const s = w?.[id];
    if (!s) continue;
    for (const [k, v] of Object.entries(s)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/** This season's totals with last season folded in at a discount. */
function seeded(current: StatMap, prior: StatMap | undefined): StatMap {
  if (!prior) return current;
  const out: StatMap = { ...current };
  for (const [k, v] of Object.entries(prior)) out[k] = (out[k] ?? 0) + v * PRIOR_WEIGHT;
  return out;
}

interface Rung {
  stat: (t: StatMap) => number;
  steps: number[];
}
interface Ladders { a: Rung; b: Rung; c: Rung }

/**
 * One ladder per attribute. Thresholds are full-season counting numbers, so a
 * star tops out around the fantasy playoffs and a rotational piece is still
 * climbing — which is the point, everyone has somewhere to go.
 */
const LADDERS: Record<string, Ladders> = {
  RB: {
    a: { stat: (t) => num(t.rush_yd), steps: [0, 300, 650, 1000, 1400] },
    b: { stat: (t) => num(t.rush_td), steps: [0, 3, 6, 10, 14] },
    c: { stat: (t) => num(t.rec), steps: [0, 15, 35, 60, 90] },
  },
  QB: {
    a: { stat: (t) => num(t.pass_yd), steps: [0, 1200, 2400, 3500, 4500] },
    b: { stat: (t) => num(t.pass_cmp), steps: [0, 120, 240, 350, 430] },
    c: { stat: (t) => num(t.rush_yd), steps: [0, 100, 250, 450, 700] },
  },
  WR: {
    a: { stat: (t) => num(t.rec_yd), steps: [0, 350, 700, 1050, 1400] },
    b: { stat: (t) => num(t.rec), steps: [0, 25, 50, 75, 100] },
    c: { stat: (t) => num(t.rec_tgt), steps: [0, 40, 80, 120, 160] },
  },
  K: {
    // Range, not workload: long makes only, with fifty-plus worth double.
    a: { stat: (t) => num(t.fgm_40_49) + num(t.fgm_50p) * 2, steps: [0, 3, 7, 12, 18] },
    b: { stat: (t) => num(t.fgm), steps: [0, 8, 16, 25, 32] },
    c: { stat: (t) => num(t.xpm), steps: [0, 15, 30, 45, 58] },
  },
};
LADDERS.TE = LADDERS.WR;

type Rated = { a: number; b: number; c: number; ta: number; tb: number; tc: number };

function ratePlayer(position: string, totals: StatMap, weight: number | undefined): Rated | null {
  const l = LADDERS[position];
  if (!l) return null;
  const a = ladder(l.a.stat(totals), l.a.steps);
  const b = ladder(l.b.stat(totals), l.b.steps);
  const c = ladder(l.c.stat(totals), l.c.steps);
  // Size still says something about a back that touchdowns do not, so it
  // nudges the value without moving the tier he has actually earned.
  const bulk = position === 'RB' ? (norm(weight, 196, 244) - 0.5) * 0.10 : 0;
  return {
    a: a.value, b: clamp01(b.value + bulk), c: c.value,
    ta: a.tier, tb: b.tier, tc: c.tier,
  };
}

const tierSum = (r: Rated) => r.ta + r.tb + r.tc;
const rankOf = (p: ArcadePlayer) => p.a + p.b + p.c;

export function buildArcadeRosters(
  playerIds: string[],
  players: PlayerMap,
  weekly: (WeekStats | undefined)[],
  priorSeason?: WeekStats,
): { run: ArcadePlayer[]; pass: ArcadePlayer[]; recv: ArcadePlayer[]; kick: ArcadePlayer[] } {
  const run: ArcadePlayer[] = [];
  const pass: ArcadePlayer[] = [];
  const recv: ArcadePlayer[] = [];
  const kick: ArcadePlayer[] = [];
  const earlier = weekly.slice(0, Math.max(0, weekly.length - TREND_LOOKBACK));

  for (const id of playerIds) {
    const meta = players[id];
    if (!meta?.position) continue;
    const weight = meta.weight ? parseInt(meta.weight, 10) : undefined;
    const prior = priorSeason?.[id];
    const now = ratePlayer(meta.position, seeded(cumulative(id, weekly), prior), weight);
    if (!now) continue;
    const before = ratePlayer(meta.position, seeded(cumulative(id, earlier), prior), weight);

    const entry: ArcadePlayer = {
      name: playerShortName(meta, id),
      team: meta.team ?? '',
      ...now,
      trend: before && tierSum(now) > tierSum(before) ? 1 : 0,
    };
    if (meta.position === 'RB') run.push(entry);
    else if (meta.position === 'QB') pass.push(entry);
    else if (meta.position === 'WR' || meta.position === 'TE') recv.push(entry);
    else kick.push(entry);
  }

  // Strongest first, so the default pick is the obvious one.
  const byRating = (x: ArcadePlayer, y: ArcadePlayer) => rankOf(y) - rankOf(x);
  run.sort(byRating);
  pass.sort(byRating);
  recv.sort(byRating);
  kick.sort(byRating);
  return { run, pass, recv, kick };
}

const encode = (list: ArcadePlayer[], limit = 6): string =>
  list
    .slice(0, limit)
    .map((p) =>
      [p.name, p.team, p.a.toFixed(2), p.b.toFixed(2), p.c.toFixed(2), p.trend, p.ta, p.tb, p.tc]
        .join(':'),
    )
    .join('|');

/** Query string the arcade page reads. Omits a game with no eligible players
 *  so it falls back to its sample roster rather than rendering empty. */
export function arcadeQuery(
  rosters: { run: ArcadePlayer[]; pass: ArcadePlayer[]; recv: ArcadePlayer[]; kick: ArcadePlayer[] },
  seed: string,
): string {
  const q = new URLSearchParams({ seed });
  if (rosters.run.length) q.set('run', encode(rosters.run));
  if (rosters.pass.length) q.set('pass', encode(rosters.pass));
  // Receivers are the deepest group on a roster, so the list runs longer.
  if (rosters.recv.length) q.set('recv', encode(rosters.recv, 8));
  if (rosters.kick.length) q.set('kick', encode(rosters.kick));
  return q.toString();
}
