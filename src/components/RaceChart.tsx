import { useMemo, type CSSProperties } from 'react';
import type { MatchupView } from '../lib/matchup';
import { buildChartModel, CHART_W, CHART_H } from '../lib/chart';
import { usePulseOnIncrease } from '../hooks/usePulseOnIncrease';

/** Style prop with the CSS `d`/`cy` properties so path morphs animate via the
 *  0.6s transition in browsers that support them (attribute set as fallback). */
const pathStyle = (d: string): CSSProperties => ({ d: `path("${d}")` }) as CSSProperties;

export function RaceChart({ view }: { view: MatchupView }) {
  const model = useMemo(() => buildChartModel(view), [view]);
  const pulse = usePulseOnIncrease(view.home.score + view.away.score);

  return (
    <svg
      className="race-chart"
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* lead gap fill */}
      <path className="morph" d={model.gap} style={pathStyle(model.gap)} fill="var(--gap-fill)" />

      {/* away curve */}
      <path
        className="morph"
        d={model.awayPath}
        style={pathStyle(model.awayPath)}
        fill="none"
        stroke="var(--line-away)"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {model.awayDash && (
        <path
          className="morph"
          d={model.awayDash}
          style={pathStyle(model.awayDash)}
          fill="none"
          stroke="var(--dash-away)"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      )}

      {/* home curve */}
      <path
        className="morph"
        d={model.homePath}
        style={pathStyle(model.homePath)}
        fill="none"
        stroke="var(--line-home)"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {model.homeDash && (
        <path
          className="morph"
          d={model.homeDash}
          style={pathStyle(model.homeDash)}
          fill="none"
          stroke="var(--dash-home)"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      )}

      {/* endpoint dot — endpulse on live score change */}
      <circle
        key={pulse}
        className={`end-dot${pulse ? ' anim-endpulse' : ''}`}
        cx={model.dot.cx}
        cy={model.dot.cy}
        style={{ cy: model.dot.cy } as CSSProperties}
        r="2.4"
        fill="#ffffff"
      />
    </svg>
  );
}
