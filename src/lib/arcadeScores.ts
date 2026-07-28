/**
 * Arcade scoring and standings.
 *
 * One scored run per game per week: the first finish counts, everything after
 * it is practice. That is what makes a board worth reading — unlimited
 * attempts would just rank whoever replayed the most.
 *
 * Weekly boards rank on raw score. Season standings rank on where you finished
 * each week, not on points, so they survive players' ratings drifting upward
 * through the season. Late scores beating early ones is then a storyline
 * rather than a broken leaderboard.
 *
 * Storage is an adapter. Local is the default and works with no backend; point
 * VITE_ARCADE_API at a deployment (see worker/arcade-scores.js) and the same
 * calls become league-wide.
 */

export type GameKey = 'run' | 'pass' | 'kick';
export const GAMES: GameKey[] = ['run', 'pass', 'kick'];
export const GAME_LABEL: Record<GameKey, string> = { run: 'RUN', pass: 'PASS', kick: 'KICK' };
/** Units differ per game, so the board can label the number it is ranking. */
export const GAME_UNIT: Record<GameKey, string> = { run: 'YD', pass: 'YD', kick: 'MADE' };

export interface ScoreEntry {
  week: number;
  rosterId: number;
  game: GameKey;
  value: number;
  detail: string;
  player: string;
  team: string;
  at: number;
}

const KEY = 'league:arcade:v1';
const API = (import.meta.env.VITE_ARCADE_API as string | undefined) || '';

function readLocal(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ScoreEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(all: ScoreEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota — scores are not worth failing a render over */
  }
}

export const isShared = () => !!API;

/** Everything recorded so far. Remote when configured, local otherwise. */
export async function loadScores(): Promise<ScoreEntry[]> {
  if (!API) return readLocal();
  try {
    const res = await fetch(`${API}/scores`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as ScoreEntry[];
  } catch {
    // A leaderboard is not worth a broken page; fall back to what is on device.
    return readLocal();
  }
}

/**
 * Records a finish. Returns the entry that now stands for that slot, and
 * whether this run was the one that counted.
 */
export async function recordScore(
  entry: Omit<ScoreEntry, 'at'>,
): Promise<{ counted: boolean; standing: ScoreEntry }> {
  const all = readLocal();
  const existing = all.find(
    (e) => e.week === entry.week && e.rosterId === entry.rosterId && e.game === entry.game,
  );
  if (existing) return { counted: false, standing: existing };

  const full: ScoreEntry = { ...entry, at: Date.now() };
  writeLocal([...all, full]);
  if (API) {
    try {
      await fetch(`${API}/scores`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(full),
      });
    } catch {
      /* kept locally; the next load will merge what the server has */
    }
  }
  return { counted: true, standing: full };
}

export interface BoardRow {
  rosterId: number;
  value: number;
  detail: string;
  player: string;
  team: string;
  rank: number;
}

/** One game's board for one week, best first. */
export function weekBoard(all: ScoreEntry[], week: number, game: GameKey): BoardRow[] {
  const rows = all
    .filter((e) => e.week === week && e.game === game)
    .sort((a, b) => b.value - a.value);
  let rank = 0;
  let prev: number | null = null;
  return rows.map((e, i) => {
    if (prev === null || e.value !== prev) rank = i + 1;
    prev = e.value;
    return { rosterId: e.rosterId, value: e.value, detail: e.detail, player: e.player, team: e.team, rank };
  });
}

export interface SeasonRow {
  rosterId: number;
  points: number;
  played: number;
  wins: number;
}

/**
 * Season standings from weekly finishes. A week you win is worth the size of
 * the field, second is one less, and so on — so a good week counts the same in
 * week 2 as in week 15 no matter how the scores inflate.
 */
export function seasonStandings(all: ScoreEntry[], fieldSize: number): SeasonRow[] {
  const totals = new Map<number, SeasonRow>();
  const weeks = [...new Set(all.map((e) => e.week))];
  for (const week of weeks) {
    for (const game of GAMES) {
      const board = weekBoard(all, week, game);
      if (!board.length) continue;
      for (const row of board) {
        const cur = totals.get(row.rosterId) ?? { rosterId: row.rosterId, points: 0, played: 0, wins: 0 };
        cur.points += Math.max(1, fieldSize - row.rank + 1);
        cur.played += 1;
        if (row.rank === 1) cur.wins += 1;
        totals.set(row.rosterId, cur);
      }
    }
  }
  return [...totals.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
}

/** Which games this roster has already banked for the week. */
export function weekStatus(
  all: ScoreEntry[],
  week: number,
  rosterId: number,
): Record<GameKey, ScoreEntry | null> {
  const out = { run: null, pass: null, kick: null } as Record<GameKey, ScoreEntry | null>;
  for (const g of GAMES) {
    out[g] = all.find((e) => e.week === week && e.rosterId === rosterId && e.game === g) ?? null;
  }
  return out;
}
