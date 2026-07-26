import { useMemo, useRef, type CSSProperties, type PointerEvent } from 'react';
import type { MatchupView } from '../lib/matchup';
import type { MatchupTimeline } from '../lib/timeline';
import { buildChartModel, py, CHART_W, CHART_H } from '../lib/chart';
import { usePulseOnIncrease } from '../hooks/usePulseOnIncrease';

/** Style prop with the CSS `d`/`cy` properties so path morphs animate via the
 *  0.6s transition in browsers that support them (attribute set as fallback). */
const pathStyle = (d: string): CSSProperties => ({ d: `path("${d}")` }) as CSSProperties;


export function RaceChart({
  view,
  timeline,
  scrubTau,
  onScrub,
}: {
  view: MatchupView;
  timeline: MatchupTimeline | null;
  scrubTau: number | null;
  onScrub: (tau: number | null) => void;
}) {
  const model = useMemo(() => buildChartModel(view, timeline), [view, timeline]);
  const pulse = usePulseOnIncrease(view.home.score + view.away.score);

  const zoneRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const active = useRef(false);

  const tauFromClientX = (clientX: number): number => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * CHART_W;
    const frac = Math.min(1, Math.max(0, x / model.nowX));
    return timeline!.fromWarped(frac * timeline!.warpedDuration);
  };

  const end = () => {
    if (active.current) {
      active.current = false;
      onScrub(null);
    }
  };

  // The chart is a dedicated scrub surface (touch-action: none): a touch that
  // lands here scrubs from the moment it lands, sticks no matter where the
  // finger wanders, tracks only lateral movement, and ends on lift.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!timeline) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    active.current = true;
    try {
      zoneRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    onScrub(tauFromClientX(e.clientX));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (active.current) onScrub(tauFromClientX(e.clientX));
  };

  const scrub =
    scrubTau !== null && timeline
      ? (() => {
          const frac = timeline.toWarped(scrubTau) / (timeline.warpedDuration || 1);
          return {
            x: Math.min(1, Math.max(0, frac)) * model.nowX,
            homeY: py(timeline.sideAt('home', scrubTau), model.maxY),
            awayY: py(timeline.sideAt('away', scrubTau), model.maxY),
          };
        })()
      : null;

  return (
    <div
      ref={zoneRef}
      className={`scrub-zone${timeline ? ' scrubbable' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
    >
    <svg
      ref={svgRef}
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

      {/* scrub crosshair — monochrome; gold stays reserved for live */}
      {scrub && (
        <g>
          <line
            x1={scrub.x}
            x2={scrub.x}
            y1={0}
            y2={CHART_H}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1"
          />
          <circle cx={scrub.x} cy={scrub.awayY} r="2.2" fill="rgba(235,235,240,0.6)" />
          <circle cx={scrub.x} cy={scrub.homeY} r="2.2" fill="#ffffff" />
        </g>
      )}
    </svg>
    </div>
  );
}
