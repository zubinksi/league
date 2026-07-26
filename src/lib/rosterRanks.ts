import type { SleeperRoster } from '../api/sleeper';
import type { PlayerMap } from '../api/players';
import type { WeekStats } from '../api/stats';
import { projectedPoints } from '../api/stats';
import { playerShortName } from '../api/players';

/**
 * Positional roster ranks: slot every team's roster (best QB = QB1, FLX =
 * best remaining RB/WR/TE), then rank each slot across the league by points
 * per game in this league's scoring. Full roster is considered, not just
 * current starters — this analyzes what a team owns.
 */

export const MIN_GP = 4;
export const RADAR_SLOTS = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLX'] as const;
export const ALL_SLOTS = [...RADAR_SLOTS, 'K', 'DEF'] as const;

export interface SlotRank {
  slot: string;
  playerId?: string;
  name?: string;
  ppg?: number;
  gp?: number;
  /** 1 = best in league at this slot. Always assigned (empty slot ranks last). */
  rank?: number;
}

export interface TeamRanks {
  rosterId: number;
  slots: SlotRank[];
}

interface PoolPlayer {
  id: string;
  position: string;
  ppg: number | undefined;
  gp: number;
}

const eligible = (p: PoolPlayer) => p.ppg !== undefined && p.gp >= MIN_GP;

/** Eligible players first (by PPG desc), then the rest by PPG desc. */
function byStrength(a: PoolPlayer, b: PoolPlayer): number {
  const ea = eligible(a) ? 1 : 0;
  const eb = eligible(b) ? 1 : 0;
  if (ea !== eb) return eb - ea;
  return (b.ppg ?? -1) - (a.ppg ?? -1);
}

export function computeRosterRanks(
  rosters: SleeperRoster[],
  players: PlayerMap,
  weeklyStats: (WeekStats | undefined)[],
  recValue: number,
): { byRoster: Map<number, TeamRanks>; teams: number } {
  // Per-player PPG over weeks they actually recorded stats.
  const production = new Map<string, { ppg: number; gp: number }>();
  const allIds = new Set<string>();
  for (const r of rosters) for (const id of r.players ?? []) allIds.add(id);
  for (const id of allIds) {
    let total = 0;
    let gp = 0;
    for (const week of weeklyStats) {
      const v = projectedPoints(week?.[id], recValue);
      if (v !== undefined) {
        total += v;
        gp++;
      }
    }
    if (gp > 0) production.set(id, { ppg: total / gp, gp });
  }

  const byRoster = new Map<number, TeamRanks>();
  for (const r of rosters) {
    const pool: PoolPlayer[] = (r.players ?? [])
      .map((id) => {
        const meta = players[id];
        const prod = production.get(id);
        return meta?.position
          ? { id, position: meta.position, ppg: prod?.ppg, gp: prod?.gp ?? 0 }
          : null;
      })
      .filter((p): p is PoolPlayer => p !== null);

    const atPos = (pos: string) => pool.filter((p) => p.position === pos).sort(byStrength);
    const qbs = atPos('QB');
    const rbs = atPos('RB');
    const wrs = atPos('WR');
    const tes = atPos('TE');
    const flexPool = [...rbs.slice(2), ...wrs.slice(2), ...tes.slice(1)].sort(byStrength);

    const picks: Record<string, PoolPlayer | undefined> = {
      QB: qbs[0],
      RB1: rbs[0],
      RB2: rbs[1],
      WR1: wrs[0],
      WR2: wrs[1],
      TE: tes[0],
      FLX: flexPool[0],
      K: atPos('K')[0],
      DEF: atPos('DEF')[0],
    };

    byRoster.set(r.roster_id, {
      rosterId: r.roster_id,
      slots: ALL_SLOTS.map((slot) => {
        const p = picks[slot];
        return {
          slot,
          playerId: p?.id,
          name: p ? playerShortName(players[p.id], p.id) : undefined,
          ppg: p?.ppg,
          gp: p?.gp,
        };
      }),
    });
  }

  // League rank per slot label: eligible production first, everyone ranked.
  for (const slot of ALL_SLOTS) {
    const entries = [...byRoster.values()]
      .map((t) => t.slots.find((s) => s.slot === slot)!)
      .sort((a, b) => {
        const ea = a.ppg !== undefined && (a.gp ?? 0) >= MIN_GP ? 1 : 0;
        const eb = b.ppg !== undefined && (b.gp ?? 0) >= MIN_GP ? 1 : 0;
        if (ea !== eb) return eb - ea;
        return (b.ppg ?? -1) - (a.ppg ?? -1);
      });
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });
  }

  return { byRoster, teams: rosters.length };
}
