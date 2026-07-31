import type { ScoreEntry } from './arcadeScores';

/**
 * Load management across a season.
 *
 * Fielding a back or a receiver in the run that counts puts miles on him, and
 * those miles fade while he sits. A heavily used player still plays — he just
 * plays worse — so this is a decision every week rather than a bye week by
 * another name: your best back at three quarters, or your second at full.
 *
 * It is derived from the score history rather than stored beside it, so there
 * is one record of what happened and no way for the two to disagree. That also
 * means it survives the move to a shared board without any migration: the
 * Worker persists the same entries.
 *
 * Practice is free. Charging for it would tax the one thing that makes anyone
 * better at the game.
 */

/** Only the two groups that carry a real workload. A tired kicker is a stretch,
 *  and a quarterback's week is not the same kind of mileage. */
const LOADED = new Set(['RB', 'WR', 'TE']);
export const carriesLoad = (position: string) => LOADED.has(position.toUpperCase());

/** How much of a week's load is still there the week after. */
const DECAY = 0.72;
/** Weeks of back-to-back work that add up to a fully gassed player. */
const CAPACITY = 2.6;
/** The most a gassed player loses off his ratings. */
const FADE = 0.3;

/** 0 fresh, 1 gassed. */
export function fatigueByPlayer(
  all: ScoreEntry[],
  rosterId: number,
  week: number,
): Map<string, number> {
  const load = new Map<string, number>();
  for (const e of all) {
    // This week's own run has not been played yet, so it cannot have tired
    // anyone out for it.
    if (e.rosterId !== rosterId || e.week >= week || !e.lineup) continue;
    const w = DECAY ** (week - e.week - 1);
    for (const id of e.lineup) load.set(id, (load.get(id) ?? 0) + w);
  }
  const out = new Map<string, number>();
  for (const [id, v] of load) out.set(id, Math.min(1, v / CAPACITY));
  return out;
}

/** What a player's ratings are worth this week, given the miles on him. */
export const freshness = (fatigue: number) => 1 - FADE * Math.max(0, Math.min(1, fatigue));

/* The word for a fatigue value — "worn" past a third, "gassed" past two —
   lives in the lineup screen in arcade-game.html, which is the only place a
   lineup is set and so the only place it was ever read. It was duplicated here
   for the roster page; with that page gone, the copy went with it rather than
   sitting around waiting to disagree with the original. */
