import type { PlayerMap } from '../api/players';
import { playerShortName } from '../api/players';
import type { WeekStats, StatMap } from '../api/stats';

/**
 * Turns a real roster into arcade characters — three ratings in 0..1 each.
 *
 * Two rules shape every mapping here. Recent weeks count for more, so a back
 * on a heater actually plays like one: season-to-date averages stabilise as
 * the year goes on and stop moving exactly when you'd want them to, so weeks
 * are decayed by half-life instead of summed flat. And rate stats over small
 * samples are pulled toward the league mean, so one missed kick out of thirty
 * doesn't swing a rating by a third.
 *
 * Ranges are deliberately wider than the league's real spread. Normalising
 * over the exact range everyone occupies clips both tails, which made every
 * roster look identical in the middle.
 */

export interface ArcadePlayer {
  name: string;
  team: string;
  a: number;
  b: number;
  c: number;
  /** Change in overall rating over the last few weeks: +1 up, -1 down, 0 flat. */
  trend: number;
}

/** Weeks back at which a game counts half as much as the latest one. */
const HALF_LIFE = 4;
/** Weeks dropped to compute the "before" rating that the trend compares to. */
const TREND_LOOKBACK = 3;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const norm = (v: number | undefined, lo: number, hi: number, fallback = 0.5): number => {
  if (v === undefined || !Number.isFinite(v)) return fallback;
  return clamp01((v - lo) / (hi - lo));
};

const per = (num: number | undefined, den: number | undefined): number | undefined =>
  num !== undefined && den !== undefined && den > 0 ? num / den : undefined;

/**
 * Rate pulled toward a prior, with the prior worth `k` attempts. Small samples
 * sit near the league mean and earn their way out as attempts accumulate.
 */
const shrunk = (
  made: number | undefined,
  att: number | undefined,
  prior: number,
  k: number,
): number | undefined => {
  if (att === undefined || !Number.isFinite(att) || att <= 0) return undefined;
  return ((made ?? 0) + prior * k) / (att + k);
};

const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;

/** First defined value — lets a mapping prefer a richer stat and fall back. */
const firstOf = (...vals: (number | undefined)[]): number | undefined =>
  vals.find((v) => v !== undefined && Number.isFinite(v));

interface Weighted {
  totals: StatMap;
  /** Sum of week weights, i.e. games played measured in "recent-equivalents". */
  games: number;
}

/**
 * Totals with recent weeks weighted more heavily. weekly[i] is week i+1, so
 * the last entry is the most recent.
 */
function weightedTotals(id: string, weekly: (WeekStats | undefined)[]): Weighted {
  const out: StatMap = {};
  let games = 0;
  for (let i = 0; i < weekly.length; i++) {
    const s = weekly[i]?.[id];
    if (!s) continue;
    const weeksAgo = weekly.length - 1 - i;
    const w = Math.pow(0.5, weeksAgo / HALF_LIFE);
    for (const [k, v] of Object.entries(s)) out[k] = (out[k] ?? 0) + v * w;
    games += w;
  }
  return { totals: out, games };
}

type Rating = { a: number; b: number; c: number };

function ratePlayer(position: string, w: Weighted, weight: number | undefined): Rating | null {
  const t = w.totals;
  const gp = Math.max(0.6, w.games);

  if (position === 'RB') {
    // Power blends listed size with goal-line work, so it is no longer a
    // biographical constant — the move it drives can move during the season.
    const size = norm(weight, 196, 244);
    const scoring = norm(per(t.rush_td, gp), 0.05, 0.85);
    return {
      a: norm(per(t.rush_yd, t.rush_att), 3.0, 5.8), // yards per carry
      b: clamp01(mix(size, scoring, 0.45)),
      // Work in space: catches plus yards per touch. Not literally broken
      // tackles — Sleeper does not expose those — but it separates a scatback
      // from a between-the-tackles grinder, which is what the rating drives.
      c: clamp01(
        mix(
          norm(per(t.rec, gp), 0.4, 5.5),
          norm(per((t.rush_yd ?? 0) + (t.rec_yd ?? 0), (t.rush_att ?? 0) + (t.rec ?? 0)), 3.2, 7.0),
          0.4,
        ),
      ),
    };
  }

  if (position === 'QB') {
    return {
      a: norm(per(t.pass_yd, t.pass_att), 5.4, 9.2), // yards per attempt
      b: norm(shrunk(t.pass_cmp, t.pass_att, 0.645, 40), 0.53, 0.75),
      // Escapability: what the rating actually drives is how long the pocket
      // holds, so it keys off scrambling, and off avoiding sacks where the
      // feed reports them.
      c: clamp01(
        mix(
          norm(per(t.rush_yd, gp), 0, 42),
          norm(per(t.pass_sack, t.pass_att), 0.11, 0.03), // inverted: fewer is better
          t.pass_sack !== undefined ? 0.4 : 0,
        ),
      ),
    };
  }

  if (position === 'K') {
    // Leg is range, not workload. Attempt volume measured how often the
    // offence stalled, so a kicker on a bad team got a bigger leg.
    const longMakes = firstOf(
      per((t.fgm_50p ?? 0) * 2 + (t.fgm_40_49 ?? 0), gp),
      per(t.fgm_40p, gp),
    );
    const longest = firstOf(t.fgm_lng, t.fg_lng);
    return {
      a: longMakes !== undefined
        ? norm(longMakes, 0.1, 1.6)
        : longest !== undefined
          ? norm(longest, 42, 58)
          : 0.5,
      b: norm(shrunk(t.fgm, t.fga, 0.84, 12), 0.70, 0.96),
      c: norm(shrunk(t.xpm, t.xpa, 0.955, 25), 0.90, 1),
    };
  }

  return null;
}

const overall = (r: Rating) => r.a + r.b + r.c;

export function buildArcadeRosters(
  playerIds: string[],
  players: PlayerMap,
  weekly: (WeekStats | undefined)[],
): { run: ArcadePlayer[]; pass: ArcadePlayer[]; kick: ArcadePlayer[] } {
  const run: ArcadePlayer[] = [];
  const pass: ArcadePlayer[] = [];
  const kick: ArcadePlayer[] = [];
  const earlier = weekly.slice(0, Math.max(1, weekly.length - TREND_LOOKBACK));

  for (const id of playerIds) {
    const meta = players[id];
    if (!meta?.position) continue;
    const weight = meta.weight ? parseInt(meta.weight, 10) : undefined;
    const now = ratePlayer(meta.position, weightedTotals(id, weekly), weight);
    if (!now) continue;
    const before = ratePlayer(meta.position, weightedTotals(id, earlier), weight);

    const delta = before ? overall(now) - overall(before) : 0;
    const entry: ArcadePlayer = {
      name: playerShortName(meta, id),
      team: meta.team ?? '',
      ...now,
      trend: delta > 0.06 ? 1 : delta < -0.06 ? -1 : 0,
    };
    if (meta.position === 'RB') run.push(entry);
    else if (meta.position === 'QB') pass.push(entry);
    else kick.push(entry);
  }

  // Strongest first, so the default pick is the obvious one.
  const byRating = (x: ArcadePlayer, y: ArcadePlayer) => overall(y) - overall(x);
  run.sort(byRating);
  pass.sort(byRating);
  kick.sort(byRating);
  return { run, pass, kick };
}

const encode = (list: ArcadePlayer[]): string =>
  list
    .slice(0, 6)
    .map((p) =>
      [p.name, p.team, p.a.toFixed(2), p.b.toFixed(2), p.c.toFixed(2), p.trend].join(':'),
    )
    .join('|');

/** Query string the arcade page reads. Omits a game with no eligible players
 *  so it falls back to its sample roster rather than rendering empty. */
export function arcadeQuery(
  rosters: { run: ArcadePlayer[]; pass: ArcadePlayer[]; kick: ArcadePlayer[] },
  seed: string,
): string {
  const q = new URLSearchParams({ seed });
  if (rosters.run.length) q.set('run', encode(rosters.run));
  if (rosters.pass.length) q.set('pass', encode(rosters.pass));
  if (rosters.kick.length) q.set('kick', encode(rosters.kick));
  return q.toString();
}
