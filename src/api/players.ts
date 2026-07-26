import { getJSON } from './http';

export interface PlayerMeta {
  player_id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  team: string | null;
  status?: string;
  injury_status?: string | null;
  number?: number | null;
  age?: number | null;
  years_exp?: number | null;
  height?: string | null;
  weight?: string | null;
  college?: string | null;
}

export type PlayerMap = Record<string, PlayerMeta>;

const CACHE_KEY = 'league:players:v2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // refresh daily per Sleeper guidance

const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

interface RawPlayer {
  player_id?: string;
  first_name?: string;
  last_name?: string;
  position?: string | null;
  team?: string | null;
  status?: string;
  injury_status?: string | null;
  number?: number | null;
  active?: boolean;
  age?: number | null;
  years_exp?: number | null;
  height?: string | null;
  weight?: string | null;
  college?: string | null;
}

/** The /players/nfl blob is ~5MB; strip it to the fields we render and cache
 *  the slimmed map in localStorage with a daily TTL. */
export async function fetchPlayers(): Promise<PlayerMap> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { at, data } = JSON.parse(cached) as { at: number; data: PlayerMap };
      if (Date.now() - at < CACHE_TTL_MS) return data;
    }
  } catch {
    /* corrupted cache — refetch */
  }

  const raw = await getJSON<Record<string, RawPlayer>>('https://api.sleeper.app/v1/players/nfl');
  const slim: PlayerMap = {};
  for (const [id, p] of Object.entries(raw)) {
    const pos = p.position ?? null;
    if (!pos || !FANTASY_POSITIONS.has(pos)) continue;
    slim[id] = {
      player_id: id,
      first_name: p.first_name ?? '',
      last_name: p.last_name ?? id,
      position: pos,
      team: p.team ?? null,
      status: p.status,
      injury_status: p.injury_status ?? null,
      number: p.number ?? null,
      age: p.age ?? null,
      years_exp: p.years_exp ?? null,
      height: p.height ?? null,
      weight: p.weight ?? null,
      college: p.college ?? null,
    };
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: slim }));
  } catch {
    /* quota exceeded — serve from memory this session */
  }
  return slim;
}

/** Short display name: `D. Maye`. Team defenses show the team name. */
export function playerShortName(p: PlayerMeta | undefined, id: string): string {
  if (!p) return id;
  if (p.position === 'DEF') return `${p.last_name || p.first_name || id} D/ST`.trim();
  const first = p.first_name ? `${p.first_name[0]}. ` : '';
  return `${first}${p.last_name}`;
}

export function playerFullName(p: PlayerMeta | undefined, id: string): string {
  if (!p) return id;
  return `${p.first_name} ${p.last_name}`.trim() || id;
}

/** `6'2"` from Sleeper's height field, which is usually inches ("74"). */
export function formatHeight(height: string | null | undefined): string | null {
  if (!height) return null;
  const inches = parseInt(height, 10);
  if (!Number.isFinite(inches) || inches < 48) return height;
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
