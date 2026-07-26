import type { MatchupView, StarterView } from './matchup';
import type { PlayerSample } from './snapshots';

/**
 * Time-indexed scoring model for one matchup. Where the snapshot recorder
 * observed real values they are used verbatim (linear between observations);
 * everywhere else each player's points ramp linearly across their game window
 * — the same approximation the chart has always drawn.
 */

const GAME_DURATION_MS = 3.25 * 60 * 60 * 1000;

interface Track {
  start: number;
  end: number;
  points: number;
  samples: PlayerSample[];
}

export interface MatchupTimeline {
  t0: number;
  t1: number;
  /** null = this player's game hasn't started at tau (render an em dash). */
  playerAt(id: string, tau: number): number | null;
  sideAt(side: 'home' | 'away', tau: number): number;
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * Math.min(1, Math.max(0, f));

export function buildTimeline(
  view: MatchupView,
  series: Record<string, PlayerSample[]>,
): MatchupTimeline | null {
  const tracks = new Map<string, Track>();

  const add = (p: StarterView) => {
    if (!p.game || p.state === 'pre') return;
    const start = p.game.kickoff;
    const end =
      p.state === 'final' ? start + GAME_DURATION_MS : start + p.game.progress * GAME_DURATION_MS;
    const samples = (series[p.playerId] ?? []).filter((s) => s.t >= start).sort((a, b) => a.t - b.t);
    tracks.set(p.playerId, { start, end: Math.max(end, start + 1), points: p.points ?? 0, samples });
  };
  for (const team of [view.home, view.away]) {
    for (const p of [...team.starters, ...team.bench]) add(p);
  }
  if (tracks.size === 0) return null;

  const t0 = Math.min(...[...tracks.values()].map((tr) => tr.start));
  const t1 = Math.max(...[...tracks.values()].map((tr) => tr.end));

  const playerAt = (id: string, tau: number): number | null => {
    const tr = tracks.get(id);
    if (!tr) return null;
    if (tau < tr.start) return null;
    const t = Math.min(tau, tr.end);
    const s = tr.samples;

    if (s.length > 0) {
      if (t <= s[0].t) {
        // Before the first observation: ramp 0 → first observed value.
        return s[0].t <= tr.start ? s[0].v : lerp(0, s[0].v, (t - tr.start) / (s[0].t - tr.start));
      }
      const last = s[s.length - 1];
      if (t >= last.t) {
        // After the last observation: ramp toward the current/final total.
        if (tr.end <= last.t) return tr.points;
        return lerp(last.v, tr.points, (t - last.t) / (tr.end - last.t));
      }
      for (let i = 1; i < s.length; i++) {
        if (t <= s[i].t) {
          return lerp(s[i - 1].v, s[i].v, (t - s[i - 1].t) / (s[i].t - s[i - 1].t || 1));
        }
      }
    }
    // No observations: plain ramp across the game window.
    return tr.points * Math.min(1, Math.max(0, (t - tr.start) / (tr.end - tr.start)));
  };

  const starterIds = {
    home: view.home.starters.map((p) => p.playerId),
    away: view.away.starters.map((p) => p.playerId),
  };

  const sideAt = (side: 'home' | 'away', tau: number): number =>
    starterIds[side].reduce((sum, id) => sum + (playerAt(id, tau) ?? 0), 0);

  return { t0, t1, playerAt, sideAt };
}
