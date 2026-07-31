import type { PlayerMap } from '../api/players';
import { playerShortName } from '../api/players';
import type { WeekStats, StatMap } from '../api/stats';
import { carriesLoad, freshness } from './fatigue';

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
  /** A rung was gained in the last few weeks. */
  levelled: boolean;
  /** …or lost. Form can fall now, so both directions are worth marking. */
  dropped: boolean;
  /** What the ladder counts, for the roster page to name it. */
  unit: string;
  tier: number;
  name: string;
  /** null once the top rung is reached. */
  nextName: string | null;
  /** The projected season number the next rung starts at. */
  nextAt: number | null;
  toNext: number | null;
  /** Projected full-season pace, which is what the tier reads. */
  stat: number;
  value: number;
}

/** Why a player cannot be fielded this week, or '' when he can. */
export type Availability = '' | 'BYE' | 'OUT' | 'IR' | 'PUP' | 'SUS' | 'Q' | 'D';

/** Statuses that keep a player off the field entirely. Questionable and
 *  Doubtful are a risk, not a bar — they are flagged and still selectable,
 *  because taking the choice away is a worse experience than informing it. */
const SIDELINED = new Set<Availability>(['BYE', 'OUT', 'IR', 'PUP', 'SUS']);
export const sidelined = (a: Availability) => SIDELINED.has(a);

const INJURY: Record<string, Availability> = {
  out: 'OUT', ir: 'IR', pup: 'PUP', sus: 'SUS', na: 'OUT', dnr: 'OUT', cov: 'OUT',
  questionable: 'Q', doubtful: 'D',
};

/**
 * Injury comes from Sleeper, which carries it on every player already. The bye
 * does not — the player blob has no schedule — so it comes from the week's
 * scoreboard, the same one the player card already reads to print BYE.
 *
 * Fails open on purpose: with no scoreboard at all, absence of an entry would
 * bench an entire roster, so a missing board means no bye filtering rather
 * than everyone benched.
 */
export function availability(
  meta: { team?: string | null; injury_status?: string | null },
  scoreboard?: Record<string, unknown>,
): Availability {
  const inj = INJURY[(meta.injury_status ?? '').trim().toLowerCase()];
  if (inj && SIDELINED.has(inj)) return inj;
  if (scoreboard && Object.keys(scoreboard).length && meta.team && !scoreboard[meta.team]) return 'BYE';
  return inj ?? '';
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
  /** '' when he can play; otherwise why not. */
  status: Availability;
  /** Season mileage, 0 fresh to 1 gassed. Never folded into a, b or c: the
   *  ladder is who he is and this is his condition this week, and a card that
   *  mixed them could not say which had moved. Applied on the way into the
   *  game instead. */
  fatigue: number;
  /** Ladder detail, for showing progress outside the game. */
  attrs: AttrDetail[];
  /** This season's real production, for context. Excludes the prior-season
   *  seed, which belongs in the ladder but would be a lie on a stat line. */
  summary: string;
}

/** A full NFL season — what a pace is projected onto. */
const GAMES = 17;
/** Weeks of form the ladder reads. */
const WINDOW = 6;
/** How long last season keeps a say. Gone once he has played this many. */
const PRIOR_GAMES = 4;
/** Games of replacement level mixed in, so one huge afternoon off a tiny
 *  sample cannot crown anyone. */
const SHRINK = 1;
/** Weeks back the trend compares against. */
const TREND_LOOKBACK = 3;
const TIERS = 5;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const norm = (v: number | undefined, lo: number, hi: number, fallback = 0.5): number => {
  if (v === undefined || !Number.isFinite(v)) return fallback;
  return clamp01((v - lo) / (hi - lo));
};

/** Projected season pace → tier, plus a value that moves inside the tier. */
function ladder(rung: Rung, projected: number): AttrDetail {
  const { steps, names } = rung;
  let i = 0;
  while (i + 1 < steps.length && projected >= steps[i + 1]) i++;
  const lo = steps[i];
  const top = i + 1 >= steps.length;
  const hi = top ? lo * 1.3 + 1 : steps[i + 1];
  const frac = hi > lo ? Math.min(1, Math.max(0, (projected - lo) / (hi - lo))) : 1;
  const need = top ? null : Math.max(0, Math.ceil(hi - projected));
  return {
    label: rung.label,
    levelled: false,
    dropped: false,
    unit: rung.unit,
    tier: i,
    name: names[i],
    nextName: top ? null : names[i + 1],
    nextAt: top ? null : steps[i + 1],
    toNext: need,
    stat: Math.round(projected),
    value: Math.min(0.98, (i + frac) / TIERS),
  };
}

/**
 * The player's line for each of the last WINDOW weeks he actually played.
 *
 * The window is weeks, not games, which is the whole point: a man who stops
 * playing runs out of window and slides back to replacement instead of
 * freezing at the form he had when he got hurt. Weeks he missed drop out of
 * both the numerator and the denominator, so a bye costs him nothing.
 */
function recent(id: string, weekly: (WeekStats | undefined)[], upTo: number): StatMap[] {
  const out: StatMap[] = [];
  for (let w = Math.max(0, upTo - WINDOW); w < upTo; w++) {
    const s = weekly[w]?.[id];
    if (s) out.push(s);
  }
  return out;
}

const playedBy = (id: string, weekly: (WeekStats | undefined)[], upTo: number) => {
  let n = 0;
  for (let w = 0; w < upTo; w++) if (weekly[w]?.[id]) n++;
  return n;
};

/**
 * Form, as a full-season pace.
 *
 * Per-game production across the trailing window, regressed toward last season
 * while the sample is thin and toward replacement level always, then multiplied
 * back up to a season so it can be read against the same thresholds a season
 * total was.
 *
 * The shrinkage terms are what make the estimate behave at both ends: the prior
 * carries week one and is gone by week five, and the single replacement game
 * keeps a lone 200-yard afternoon from reading as an MVP season.
 */
function project(rung: Rung, window: StatMap[], played: number, prior: StatMap | undefined): number {
  const repl = rung.steps[1] / GAMES;
  const priorRate = prior ? rung.stat(prior) / GAMES : repl;
  const priorW = Math.max(0, PRIOR_GAMES - played);
  const sum = window.reduce((s, w) => s + rung.stat(w), 0);
  return ((sum + priorW * priorRate + SHRINK * repl) / (window.length + priorW + SHRINK)) * GAMES;
}

const num = (v: number | undefined) => (Number.isFinite(v) ? (v as number) : 0);

/** Real production so far, for the stat line. Never feeds a rating — that is
 *  the whole point of the change: what he has banked and how good he is now
 *  are different questions. */
function cumulative(id: string, weekly: (WeekStats | undefined)[]): StatMap {
  const out: StatMap = {};
  for (const w of weekly) {
    const s = w?.[id];
    if (!s) continue;
    for (const [k, v] of Object.entries(s)) out[k] = (out[k] ?? 0) + v;
  }
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

/** Where a player stands as of `upTo` weeks into the season. */
function ratePlayer(
  position: string,
  id: string,
  weekly: (WeekStats | undefined)[],
  upTo: number,
  prior: StatMap | undefined,
  weight: number | undefined,
): Rated | null {
  const rungs = LADDERS[position];
  if (!rungs) return null;
  const window = recent(id, weekly, upTo);
  const played = playedBy(id, weekly, upTo);
  const attrs = rungs.map((r) => ladder(r, project(r, window, played, prior)));
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
  scoreboard?: Record<string, unknown>,
  fatigue?: Map<string, number>,
): { run: ArcadePlayer[]; pass: ArcadePlayer[]; recv: ArcadePlayer[]; kick: ArcadePlayer[] } {
  const run: ArcadePlayer[] = [];
  const pass: ArcadePlayer[] = [];
  const recv: ArcadePlayer[] = [];
  const kick: ArcadePlayer[] = [];
  const back = Math.max(0, weekly.length - TREND_LOOKBACK);

  for (const id of playerIds) {
    const meta = players[id];
    if (!meta?.position) continue;
    const weight = meta.weight ? parseInt(meta.weight, 10) : undefined;
    const prior = priorSeason?.[id];
    const thisSeason = cumulative(id, weekly);
    const now = ratePlayer(meta.position, id, weekly, weekly.length, prior, weight);
    if (!now) continue;
    const before = ratePlayer(meta.position, id, weekly, back, prior, weight);
    // Per rung, so the bar can mark the one just moved rather than the card
    // carrying a single badge for the whole player. Both directions now: form
    // falls, and a rung lost is worth seeing.
    if (before) {
      now.attrs.forEach((a, i) => {
        a.levelled = a.tier > before.attrs[i].tier;
        a.dropped = a.tier < before.attrs[i].tier;
      });
    }

    const entry: ArcadePlayer = {
      id,
      name: playerShortName(meta, id),
      team: meta.team ?? '',
      position: meta.position,
      ...now,
      summary: summarise(meta.position, thisSeason),
      trend: before ? Math.sign(tierSum(now) - tierSum(before)) : 0,
      status: availability(meta, scoreboard),
      fatigue: (carriesLoad(meta.position) && fatigue?.get(id)) || 0,
    };
    if (meta.position === 'RB') run.push(entry);
    else if (meta.position === 'QB') pass.push(entry);
    else if (meta.position === 'WR' || meta.position === 'TE') recv.push(entry);
    else kick.push(entry);
  }

  // Available first, then strongest, so the default pick is one you can
  // actually field. Sidelined players stay in the list rather than vanishing:
  // seeing that your best back is on bye is the point of the mechanic.
  const byRating = (x: ArcadePlayer, y: ArcadePlayer) =>
    Number(sidelined(x.status)) - Number(sidelined(y.status)) || rankOf(y) - rankOf(x);
  run.sort(byRating);
  pass.sort(byRating);
  recv.sort(byRating);
  kick.sort(byRating);
  return { run, pass, recv, kick };
}

/** One player, for the card that opens on him. */
export function arcadePlayer(
  id: string,
  players: PlayerMap,
  weekly: (WeekStats | undefined)[],
  priorSeason?: WeekStats,
  scoreboard?: Record<string, unknown>,
): ArcadePlayer | null {
  const g = buildArcadeRosters([id], players, weekly, priorSeason, scoreboard);
  return g.pass[0] ?? g.run[0] ?? g.recv[0] ?? g.kick[0] ?? null;
}

/** A rung gained or lost, and the week it moved. */
export interface Step {
  week: number;
  tier: number;
  name: string;
  /** 1 climbed, -1 slid back. */
  dir: number;
}

export interface Rise {
  label: string;
  unit: string;
  /** Rungs moved this season, oldest first. Empty when he has not moved. */
  steps: Step[];
  /** Progress in rungs (0..TIERS) at the end of each week, index = week - 1.
   *  Every ladder lands on this one scale, which is what lets three counters
   *  in different units share an axis. */
  series: number[];
  /** What the most recent week put on this ladder's counter. */
  added: number;
}

/**
 * The season, replayed a week at a time — the same form model evaluated as of
 * each week, so the line is exactly what the ladder would have read that
 * Sunday. It can fall, which is the point: a bust sliding down the chart is
 * the story the old monotonic version could not tell.
 *
 * Where last season still has weight, that shows as the opening level rather
 * than as a step — nothing was climbed for it.
 */
export function climb(
  position: string,
  id: string,
  weekly: (WeekStats | undefined)[],
  priorSeason?: WeekStats,
): Rise[] {
  const rungs = LADDERS[position];
  if (!rungs) return [];
  const prior = priorSeason?.[id];

  const opening = rungs.map((r) => ladder(r, project(r, [], 0, prior)).tier);
  const at = [...opening];
  const steps: Step[][] = rungs.map(() => []);
  const series: number[][] = rungs.map(() => []);
  for (let w = 1; w <= weekly.length; w++) {
    const window = recent(id, weekly, w);
    const played = playedBy(id, weekly, w);
    rungs.forEach((r, i) => {
      const d = ladder(r, project(r, window, played, prior));
      series[i].push(d.value * TIERS);
      if (d.tier !== at[i]) {
        steps[i].push({ week: w, tier: d.tier, name: d.name, dir: Math.sign(d.tier - at[i]) });
        at[i] = d.tier;
      }
    });
  }

  const latest = weekly.length ? weekly[weekly.length - 1]?.[id] : undefined;
  return rungs.map((r, i) => ({
    label: r.label,
    unit: r.unit,
    steps: steps[i],
    series: series[i],
    added: latest ? r.stat(latest) : 0,
  }));
}

const encode = (list: ArcadePlayer[], limit = 6): string =>
  // If every man at a position is out, send them anyway — an unplayable
  // position is worse than fielding someone on bye, and a real lineup has to
  // start somebody at each spot so this should not come up.
  (list.some((p) => !sidelined(p.status)) ? list : list.map((p) => ({ ...p, status: '' as Availability })))
    .slice(0, limit)
    .map((p) =>
      // The id rides along so the game can ask the host to open a player card
      // — it has no other way to name who it is showing.
      [p.name, p.team,
       (p.a * freshness(p.fatigue)).toFixed(2),
       (p.b * freshness(p.fatigue)).toFixed(2),
       (p.c * freshness(p.fatigue)).toFixed(2),
       p.trend, p.ta, p.tb, p.tc, p.status, p.id, p.fatigue.toFixed(2)].join(':'),
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
