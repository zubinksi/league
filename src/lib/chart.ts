import type { MatchupView, StarterView } from './matchup';

/** Chart geometry — exact values from the design spec. */
export const CHART_W = 340;
export const CHART_H = 88;
const BASE = 78; // y for value 0
const TOP = 6; // y ceiling
const SAMPLES = 24;

/** Estimated wall-clock length of an NFL game incl. breaks. */
const GAME_DURATION_MS = 3.25 * 60 * 60 * 1000;

export function py(v: number, maxY: number): number {
  return BASE - (Math.min(v, maxY) / maxY) * (BASE - TOP);
}

export function nowXFor(progress: number): number {
  return (0.42 + 0.34 * progress) * CHART_W;
}

/**
 * Cumulative score series over game time, approximated from per-player game
 * windows: each starter's points ramp linearly from their game's kickoff to
 * its current point in time (Sleeper exposes no intra-game timeline).
 * Returns SAMPLES values ending exactly at the team's current total.
 */
function cumulativeSeries(starters: StarterView[], score: number): number[] {
  const windows: { start: number; end: number; points: number }[] = [];
  for (const p of starters) {
    if (!p.game || p.state === 'pre' || !p.points) continue;
    const start = p.game.kickoff;
    const end =
      p.state === 'final' ? start + GAME_DURATION_MS : start + p.game.progress * GAME_DURATION_MS;
    windows.push({ start, end: Math.max(end, start + 1), points: p.points });
  }
  if (windows.length === 0) return [0, score]; // degraded 2-point line

  const t0 = Math.min(...windows.map((w) => w.start));
  const t1 = Math.max(...windows.map((w) => w.end));
  const series: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const tau = t0 + (i / (SAMPLES - 1)) * (t1 - t0);
    let v = 0;
    for (const w of windows) {
      const frac = Math.min(1, Math.max(0, (tau - w.start) / (w.end - w.start)));
      v += w.points * frac;
    }
    series.push(v);
  }
  series[SAMPLES - 1] = score; // last sample = current total, exactly
  return series;
}

function linePath(series: number[], x0: number, x1: number, maxY: number): string {
  const m = series.length;
  return series
    .map((v, i) => {
      const x = x0 + (i / (m - 1)) * (x1 - x0);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${py(v, maxY).toFixed(2)}`;
    })
    .join(' ');
}

function gapPath(a: number[], b: number[], x0: number, x1: number, maxY: number): string {
  const m = a.length;
  const xs = (i: number) => x0 + (i / (m - 1)) * (x1 - x0);
  const fwd = a.map((v, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(2)},${py(v, maxY).toFixed(2)}`);
  const back = [...b]
    .map((v, i) => ({ x: xs(i), y: py(v, maxY) }))
    .reverse()
    .map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  return `${fwd.join(' ')} ${back.join(' ')} Z`;
}

export interface ChartModel {
  live: boolean;
  maxY: number;
  nowX: number;
  homePath: string;
  awayPath: string;
  gap: string;
  homeDash?: string;
  awayDash?: string;
  dot: { cx: number; cy: number };
}

export function buildChartModel(view: MatchupView): ChartModel {
  const live = view.phase !== 'final';
  const maxY = live ? 105 : 130;
  const nowX = live ? nowXFor(view.progress) : CHART_W;

  // Pad series to equal length so home/away sample the same x positions.
  let homeSeries = cumulativeSeries(view.home.starters, view.home.score);
  let awaySeries = cumulativeSeries(view.away.starters, view.away.score);
  if (homeSeries.length !== awaySeries.length) {
    const stretch = (s: number[], n: number) =>
      Array.from({ length: n }, (_, i) => {
        const t = (i / (n - 1)) * (s.length - 1);
        const lo = Math.floor(t);
        const hi = Math.min(s.length - 1, lo + 1);
        return s[lo] + (s[hi] - s[lo]) * (t - lo);
      });
    const n = Math.max(homeSeries.length, awaySeries.length);
    homeSeries = stretch(homeSeries, n);
    awaySeries = stretch(awaySeries, n);
  }

  const model: ChartModel = {
    live,
    maxY,
    nowX,
    homePath: linePath(homeSeries, 0, nowX, maxY),
    awayPath: linePath(awaySeries, 0, nowX, maxY),
    gap: gapPath(homeSeries, awaySeries, 0, nowX, maxY),
    dot: { cx: nowX, cy: py(view.home.score, maxY) },
  };

  if (live) {
    const dash = (nowY: number, projFinal: number) =>
      `M${nowX.toFixed(2)},${nowY.toFixed(2)} L${CHART_W},${py(projFinal, maxY).toFixed(2)}`;
    model.homeDash = dash(py(view.home.score, maxY), view.home.projectedFinal);
    model.awayDash = dash(py(view.away.score, maxY), view.away.projectedFinal);
  }
  return model;
}
