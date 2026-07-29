/**
 * Arcade scoring and standings.
 *
 * One scored run per game per week: the first finish counts, everything after
 * it is practice. That is what makes a board worth reading — unlimited
 * attempts would just rank whoever replayed the most.
 *
 * Boards are all-time and per game: one row per team, their best run ever.
 * Ratings now climb across a season by design, so a late score beating an
 * early one is the system working, and an all-time best is the honest frame
 * for it. Each board ranks on the number worth bragging about and breaks ties
 * on the finer one, because touchdowns alone would tie half a league.
 *
 * Storage is an adapter. Local is the default and works with no backend; point
 * VITE_ARCADE_API at a deployment (see worker/arcade-scores.js) and the same
 * calls become league-wide.
 */

/** 'run' and 'pass' are retired — they merged into 'drive'. The keys stay in
 *  the union so entries banked before the merge still parse, but they are no
 *  longer offered, and their physics changed underneath them anyway. */
export type GameKey = 'drive' | 'kick' | 'run' | 'pass';
export const GAMES: GameKey[] = ['drive', 'kick'];
export const GAME_LABEL: Record<GameKey, string> = {
  drive: 'DRIVE', kick: 'KICK', run: 'RUN', pass: 'PASS',
};
/** Units differ per game, so the board can label the number it is ranking. */
export const GAME_UNIT: Record<GameKey, string> = {
  drive: 'PTS', kick: 'MADE', run: 'TD', pass: 'TD',
};

export interface ScoreEntry {
  week: number;
  rosterId: number;
  game: GameKey;
  /** The headline number: touchdowns, or field goals made. */
  value: number;
  /** Tiebreak — yards, or longest make. */
  tie: number;
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
  tie: number;
  detail: string;
  player: string;
  team: string;
  week: number;
  rank: number;
}

const better = (a: ScoreEntry, b: ScoreEntry) => b.value - a.value || b.tie - a.tie;

/** One game, all time, one row per team — their best run ever. */
export function allTimeBoard(all: ScoreEntry[], game: GameKey): BoardRow[] {
  const best = new Map<number, ScoreEntry>();
  for (const e of all) {
    if (e.game !== game) continue;
    const cur = best.get(e.rosterId);
    if (!cur || better(e, cur) < 0) best.set(e.rosterId, e);
  }
  const rows = [...best.values()].sort(better);
  let rank = 0;
  let prev: string | null = null;
  return rows.map((e, i) => {
    const key = `${e.value}:${e.tie}`;
    if (prev === null || key !== prev) rank = i + 1;
    prev = key;
    return {
      rosterId: e.rosterId, value: e.value, tie: e.tie, detail: e.detail,
      player: e.player, team: e.team, week: e.week, rank,
    };
  });
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
