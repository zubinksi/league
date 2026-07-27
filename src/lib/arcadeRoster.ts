import type { PlayerMap } from '../api/players';
import { playerShortName } from '../api/players';
import type { WeekStats, StatMap } from '../api/stats';

/**
 * Turns a real roster into arcade characters. Each mini game takes three
 * ratings in 0..1; they're derived from season production and listed size,
 * with a neutral 0.5 fallback whenever the underlying stat is missing so a
 * thin stat line never produces a zeroed-out player.
 */

export interface ArcadePlayer {
  name: string;
  team: string;
  a: number;
  b: number;
  c: number;
}

const norm = (v: number | undefined, lo: number, hi: number, fallback = 0.5): number => {
  if (v === undefined || !Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
};
const per = (num: number | undefined, den: number | undefined): number | undefined =>
  num !== undefined && den !== undefined && den > 0 ? num / den : undefined;

/** Games with any recorded activity, used as a per-game denominator. */
function gamesPlayed(id: string, weekly: (WeekStats | undefined)[]): number {
  let n = 0;
  for (const w of weekly) if (w?.[id]) n++;
  return n;
}

function totals(id: string, weekly: (WeekStats | undefined)[]): StatMap {
  const out: StatMap = {};
  for (const w of weekly) {
    const s = w?.[id];
    if (!s) continue;
    for (const [k, v] of Object.entries(s)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

export function buildArcadeRosters(
  playerIds: string[],
  players: PlayerMap,
  weekly: (WeekStats | undefined)[],
): { run: ArcadePlayer[]; pass: ArcadePlayer[]; kick: ArcadePlayer[] } {
  const run: ArcadePlayer[] = [];
  const pass: ArcadePlayer[] = [];
  const kick: ArcadePlayer[] = [];

  for (const id of playerIds) {
    const meta = players[id];
    if (!meta?.position) continue;
    const t = totals(id, weekly);
    const gp = Math.max(1, gamesPlayed(id, weekly));
    const base = { name: playerShortName(meta, id), team: meta.team ?? '' };
    const weight = meta.weight ? parseInt(meta.weight, 10) : undefined;

    if (meta.position === 'RB') {
      run.push({
        ...base,
        a: norm(per(t.rush_yd, t.rush_att), 3.2, 5.4),          // yards per carry → speed
        b: norm(weight, 198, 240),                              // listed weight   → power
        c: norm(per(t.rec, gp), 0.5, 5),                        // catches/game    → elusive
      });
    } else if (meta.position === 'QB') {
      pass.push({
        ...base,
        a: norm(per(t.pass_yd, t.pass_att), 5.8, 8.8),          // yards/attempt   → arm
        b: norm(per(t.pass_cmp, t.pass_att), 0.56, 0.72),       // completion %    → accuracy
        c: norm(per(t.rush_yd, gp), 2, 38),                     // scramble yards  → poise
      });
    } else if (meta.position === 'K') {
      kick.push({
        ...base,
        a: norm(per(t.fga, gp), 1.4, 3.2),                      // attempt volume  → leg
        b: norm(per(t.fgm, t.fga), 0.72, 0.94),                 // FG %            → accuracy
        c: norm(per(t.xpm, t.xpa ?? t.xpm), 0.9, 1),            // XP reliability  → nerve
      });
    }
  }

  // Strongest first, so the default pick is the obvious one.
  const rank = (p: ArcadePlayer) => p.a + p.b + p.c;
  run.sort((x, y) => rank(y) - rank(x));
  pass.sort((x, y) => rank(y) - rank(x));
  kick.sort((x, y) => rank(y) - rank(x));
  return { run, pass, kick };
}

const encode = (list: ArcadePlayer[]): string =>
  list
    .slice(0, 6)
    .map((p) => `${p.name}:${p.team}:${p.a.toFixed(2)}:${p.b.toFixed(2)}:${p.c.toFixed(2)}`)
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
