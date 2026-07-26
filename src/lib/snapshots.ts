import { MOCK } from '../config';
import type { SleeperMatchupEntry } from '../api/sleeper';

/**
 * Live scoring snapshot recorder. While games are live, each poll records the
 * per-player points that changed (delta-encoded) per matchup, persisted in
 * localStorage. Replayed, these become a *real* scoring timeline for any
 * stretch of the week the app was open — the chart/scrubber interpolates
 * only where nothing was observed.
 */

const PREFIX = 'league:snap:v1';
const MAX_SAMPLES = 2400;

interface Sample {
  t: number;
  d: Record<string, number>;
}

interface Store {
  samples: Sample[];
  last: Record<string, number>;
}

export interface PlayerSample {
  t: number;
  v: number;
}

const memory = new Map<string, Store>();

const keyFor = (season: string, week: number, matchupId: number) =>
  `${PREFIX}:${season}:${week}:${matchupId}`;

function load(key: string): Store {
  const cached = memory.get(key);
  if (cached) return cached;
  let store: Store = { samples: [], last: {} };
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const samples = (JSON.parse(raw) as { samples: Sample[] }).samples ?? [];
      const last: Record<string, number> = {};
      for (const s of samples) Object.assign(last, s.d);
      store = { samples, last };
    }
  } catch {
    /* corrupted — start fresh */
  }
  memory.set(key, store);
  return store;
}

/** Halve the older half of the log when it grows too big; recent detail wins. */
function thin(samples: Sample[]): Sample[] {
  const cut = Math.floor(samples.length / 2);
  const old = samples.slice(0, cut).filter((_, i) => i % 2 === 0);
  return [...old, ...samples.slice(cut)];
}

export function recordMatchupSnapshots(
  season: string,
  week: number,
  entries: SleeperMatchupEntry[],
): void {
  if (MOCK) return;
  const byMatchup = new Map<number, SleeperMatchupEntry[]>();
  for (const e of entries) {
    if (e.matchup_id === null) continue;
    byMatchup.set(e.matchup_id, [...(byMatchup.get(e.matchup_id) ?? []), e]);
  }

  const now = Date.now();
  for (const [matchupId, group] of byMatchup) {
    const key = keyFor(season, week, matchupId);
    const store = load(key);

    const delta: Record<string, number> = {};
    for (const entry of group) {
      for (const [id, v] of Object.entries(entry.players_points ?? {})) {
        if (store.last[id] !== v) delta[id] = v;
      }
    }
    if (Object.keys(delta).length === 0) continue;

    store.samples.push({ t: now, d: delta });
    Object.assign(store.last, delta);
    if (store.samples.length > MAX_SAMPLES) store.samples = thin(store.samples);

    try {
      localStorage.setItem(key, JSON.stringify({ samples: store.samples }));
    } catch {
      /* quota exceeded — keep recording in memory only */
    }
  }
}

/** Replay a matchup's log into per-player observed series (time-sorted). */
export function loadPlayerSeries(
  season: string,
  week: number,
  matchupId: number,
): Record<string, PlayerSample[]> {
  if (MOCK) return {};
  const store = load(keyFor(season, week, matchupId));
  const out: Record<string, PlayerSample[]> = {};
  for (const s of store.samples) {
    for (const [id, v] of Object.entries(s.d)) {
      (out[id] ??= []).push({ t: s.t, v });
    }
  }
  return out;
}
