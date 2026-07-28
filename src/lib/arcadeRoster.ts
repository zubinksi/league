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

export interface AttrDetail {
  label: string;
  /** This rung was crossed in the last few weeks. */
  levelled: boolean;
  /** What the ladder counts, for the roster page to name it. */
  unit: string;
  tier: number;
  name: string;
  /** null once the top rung is reached. */
  nextName: string | null;
  toNext: number | null;
  stat: number;
  value: number;
}

export interface ArcadePlayer {
  /** Sleeper player id, so callers can join back to other data. */
  id: string;
  name: string;
  team: string;
  position: string;
  a: number;
  b: number;
  c: number;
  /** Tier index 0..4 per attribute; the game holds its own copy of the names. */
  ta: number;
  tb: number;
  tc: number;
  /** 1 when any attribute gained a tier in the last few weeks. */
  trend: number;
  /** Ladder detail, for showing progress outside the game. */
  attrs: AttrDetail[];
  /** This season's real production, for context. Excludes the prior-season
   *  seed, which belongs in the ladder but would be a lie on a stat line. */
  summary: string;
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
function ladder(rung: Rung, stat: number): AttrDetail {
  const { steps, names } = rung;
  let i = 0;
  while (i + 1 < steps.length && stat >= steps[i + 1]) i++;
  const lo = steps[i];
  const top = i + 1 >= steps.length;
  const hi = top ? lo * 1.3 + 1 : steps[i + 1];
  const frac = hi > lo ? Math.min(1, Math.max(0, (stat - lo) / (hi - lo))) : 1;
  const need = top ? null : Math.max(0, Math.ceil(hi - stat));
  return {
    label: rung.label,
    levelled: false,
    unit: need === 1 ? rung.unitOne ?? rung.unit : rung.unit,
    tier: i,
    name: names[i],
    nextName: top ? null : names[i + 1],
    toNext: need,
    stat: Math.round(stat),
    value: Math.min(0.98, (i + frac) / TIERS),
  };
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
  label: string;
  /** What the ladder counts — shown as "260 rush yd to Breakaway". */
  unit: string;
  /** Singular form, for when exactly one is needed. */
  unitOne?: string;
  stat: (t: StatMap) => number;
  steps: number[];
  names: string[];
}

/**
 * One ladder per attribute. Thresholds are full-season counting numbers, so a
 * star tops out around the fantasy playoffs and a rotational piece is still
 * climbing — which is the point, everyone has somewhere to go.
 */
const LADDERS: Record<string, Rung[]> = {
  RB: [
    { label: 'Speed', unit: 'rush yd', stat: (t) => num(t.rush_yd), steps: [0, 300, 650, 1000, 1400],
      names: ['Plodder', 'Strider', 'Burst', 'Breakaway', 'Home Run'] },
    { label: 'Power', unit: 'rush TD', stat: (t) => num(t.rush_td), steps: [0, 3, 6, 10, 14],
      names: ['Arm Tackle', 'Grinder', 'Bruiser', 'Battering Ram', 'Freight Train'] },
    { label: 'Elusive', unit: 'catches', unitOne: 'catch', stat: (t) => num(t.rec), steps: [0, 15, 35, 60, 90],
      names: ['Stone Hands', 'Outlet', 'Mismatch', 'Weapon', 'Joystick'] },
  ],
  QB: [
    { label: 'Arm', unit: 'pass yd', stat: (t) => num(t.pass_yd), steps: [0, 1200, 2400, 3500, 4500],
      names: ['Checkdown', 'Rhythm', 'Gunslinger', 'Cannon', 'Howitzer'] },
    { label: 'Accuracy', unit: 'completions', unitOne: 'completion', stat: (t) => num(t.pass_cmp), steps: [0, 120, 240, 350, 430],
      names: ['Scattershot', 'Steady', 'Sharp', 'Surgeon', 'Sniper'] },
    { label: 'Escape', unit: 'rush yd', stat: (t) => num(t.rush_yd), steps: [0, 100, 250, 450, 700],
      names: ['Statue', 'Mobile', 'Escape Artist', 'Dual Threat', 'Houdini'] },
  ],
  WR: [
    { label: 'Speed', unit: 'rec yd', stat: (t) => num(t.rec_yd), steps: [0, 350, 700, 1050, 1400],
      names: ['Possession', 'Chain Mover', 'Stretch', 'Deep Threat', 'Afterburner'] },
    { label: 'Hands', unit: 'catches', unitOne: 'catch', stat: (t) => num(t.rec), steps: [0, 25, 50, 75, 100],
      names: ['Bricks', 'Reliable', 'Sure Hands', 'Velcro', 'Glue'] },
    { label: 'Route', unit: 'targets', unitOne: 'target', stat: (t) => num(t.rec_tgt), steps: [0, 40, 80, 120, 160],
      names: ['Decoy', 'Option', 'Target', 'Focal Point', 'Alpha'] },
  ],
  K: [
    // Range, not workload: long makes only, with fifty-plus worth double.
    { label: 'Leg', unit: 'long makes', unitOne: 'long make', stat: (t) => num(t.fgm_40_49) + num(t.fgm_50p) * 2,
      steps: [0, 3, 7, 12, 18], names: ['Short Range', 'Reliable', 'Big Leg', 'Cannon', 'Moon Shot'] },
    { label: 'Accuracy', unit: 'field goals', unitOne: 'field goal', stat: (t) => num(t.fgm), steps: [0, 8, 16, 25, 32],
      names: ['Shaky', 'Steady', 'Automatic', 'Ice', 'Perfect'] },
    { label: 'Nerve', unit: 'extra points', unitOne: 'extra point', stat: (t) => num(t.xpm), steps: [0, 15, 30, 45, 58],
      names: ['Nervy', 'Composed', 'Cool', 'Clutch', 'Ice Water'] },
  ],
};
LADDERS.TE = LADDERS.WR;

type Rated = { attrs: AttrDetail[]; a: number; b: number; c: number; ta: number; tb: number; tc: number };

function ratePlayer(position: string, totals: StatMap, weight: number | undefined): Rated | null {
  const rungs = LADDERS[position];
  if (!rungs) return null;
  const attrs = rungs.map((r) => ladder(r, r.stat(totals)));
  // Size still says something about a back that touchdowns do not, so it
  // nudges the value without moving the tier he has actually earned.
  const bulk = position === 'RB' ? (norm(weight, 196, 244) - 0.5) * 0.10 : 0;
  return {
    attrs,
    a: attrs[0].value, b: clamp01(attrs[1].value + bulk), c: attrs[2].value,
    ta: attrs[0].tier, tb: attrs[1].tier, tc: attrs[2].tier,
  };
}

const tierSum = (r: Rated) => r.ta + r.tb + r.tc;

const whole = (v: number) => Math.round(v).toLocaleString();

/** Season line, in the shape that suits the position. */
function summarise(position: string, t: StatMap): string {
  if (position === 'QB') {
    return `${whole(num(t.pass_yd))} YD · ${whole(num(t.pass_td))} TD · ${whole(num(t.pass_int))} INT`;
  }
  if (position === 'RB') {
    return `${whole(num(t.rush_att))} CAR · ${whole(num(t.rush_yd))} YD · `
      + `${whole(num(t.rush_td) + num(t.rec_td))} TD`;
  }
  if (position === 'WR' || position === 'TE') {
    return `${whole(num(t.rec))} REC · ${whole(num(t.rec_yd))} YD · ${whole(num(t.rec_td))} TD`;
  }
  return `${whole(num(t.fgm))}/${whole(num(t.fga))} FG · ${whole(num(t.xpm))} XP`;
}
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
    const thisSeason = cumulative(id, weekly);
    const now = ratePlayer(meta.position, seeded(thisSeason, prior), weight);
    if (!now) continue;
    const before = ratePlayer(meta.position, seeded(cumulative(id, earlier), prior), weight);
    // Per rung, so the bar can mark the one just crossed rather than the card
    // carrying a single badge for the whole player.
    if (before) {
      now.attrs.forEach((a, i) => { a.levelled = a.tier > before.attrs[i].tier; });
    }

    const entry: ArcadePlayer = {
      id,
      name: playerShortName(meta, id),
      team: meta.team ?? '',
      position: meta.position,
      ...now,
      summary: summarise(meta.position, thisSeason),
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
