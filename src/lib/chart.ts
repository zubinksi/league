import type { MatchupView } from './matchup';
import type { MatchupTimeline } from './timeline';

/** Chart geometry — exact values from the design spec. */
export const CHART_W = 340;
export const CHART_H = 88;
const BASE = 78; // y for value 0
const TOP = 6; // y ceiling
const SAMPLES = 24;

export function py(v: number, maxY: number): number {
  return BASE - (Math.min(v, maxY) / maxY) * (BASE - TOP);
}

export function nowXFor(progress: number): number {
  return (0.42 + 0.34 * progress) * CHART_W;
}

/** Cumulative score series sampled from the matchup timeline, ending exactly
 *  at the team's current total. Falls back to a 2-point line with no games. */
function cumulativeSeries(
  timeline: MatchupTimeline | null,
  side: 'home' | 'away',
  score: number,
): number[] {
  if (!timeline) return [0, score];
  const { t0, t1 } = timeline;
  const series: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    series.push(timeline.sideAt(side, t0 + (i / (SAMPLES - 1)) * (t1 - t0)));
  }
  series[SAMPLES - 1] = score;
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

export function buildChartModel(view: MatchupView, timeline: MatchupTimeline | null): ChartModel {
  const live = view.phase !== 'final';
  const maxY = live ? 105 : 130;
  const nowX = live ? nowXFor(view.progress) : CHART_W;

  const homeSeries = cumulativeSeries(timeline, 'home', view.home.score);
  const awaySeries = cumulativeSeries(timeline, 'away', view.away.score);

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
